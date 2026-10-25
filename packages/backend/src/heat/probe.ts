// 二次热度探查：一条新闻落地后，用它的标题在 Bing 上再搜一次，看「官方来源与媒体报道」里
// 有多少家也在报同一件事。命中家数写进 heat_probes，并同步到 publications.heat 供排序使用。
//
// 搜索走自托管的 Playwright renderer（config.renderUrl，compose 的 renderer 服务）：
// 直接 curl bing.com/search 拿到的是壳页，渲染后才是结果。`form=QBRE&qs=n` 不能省——不带它
// Bing 会把长尾中文查询降级成单字匹配（实测「中国人寿 增资 3600亿」会返回「中华人民共和国」）。
//
// 探查是「锦上添花」：renderer 没配、Bing 拒绝、页面改版，都只把这一次记成 failed 并留错误，
// 不影响文章本身的发布；heat 默认 0，排序按原来的时间顺序走。
import * as cheerio from "cheerio";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { heatSourceFor, type HeatSource } from "@aihot/industry/heat-sources";
import { setPublicationHeat } from "../publication/items.ts";

/** 一条命中的报道。 */
export interface HeatMatch {
  org: string;
  host: string;
  kind: "official" | "media";
  title: string;
  url: string;
  /** 本站已在日常采集的源，命中了也不算「外面还有谁在报」（同一件事只算一次）。 */
  own: boolean;
  /**
   * 命中机构对应的本站信源 id（没有则为空）。事件级去重要用到它：只有当这些源的文章确实属于
   * 同一个事件时，这条命中才算重复（见 events/hot.ts 的 currentSignals）。
   */
  ownSourceIds: string[];
}

export interface HeatResult {
  query: string;
  hits: number;
  total: number;
  matches: HeatMatch[];
}

/** 标题里对搜索无用的成分：栏目分隔、站点后缀、引号。引号直接去掉而不换成空格：
 *  「互联网保险或迎来"十大禁令"」去掉后才是「迎来十大禁令」，换成空格会把词切断。 */
export function heatQuery(title: string): string {
  const cleaned = title
    .replace(/[\u201c\u201d\u2018\u2019"'「」『』]/g, "")
    .replace(/\s*[-—_|｜]\s*[^-—_|｜]{1,12}$/, "")
    .replace(/[（(][^（）()]{0,30}[)）]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  // Bing 对过长的查询会丢词，取前 48 个字足以锁定同一件事。
  return cleaned.length > 48 ? cleaned.slice(0, 48) : cleaned;
}

/** Bing 把部分结果包成 /ck/a?…&u=a1<base64url>，解出真实地址。 */
export function decodeBingUrl(href: string): string {
  if (!/bing\.com\/ck\/a/i.test(href)) return href;
  const u = new URL(href, "https://www.bing.com").searchParams.get("u");
  if (!u || !u.startsWith("a1")) return href;
  try {
    const raw = Buffer.from(u.slice(2).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return /^https?:\/\//.test(raw) ? raw : href;
  } catch {
    return href;
  }
}

export interface SearchHit {
  title: string;
  url: string;
}

/** 渲染后的 Bing 结果页里取标题链接。 */
export function parseBingResults(html: string): SearchHit[] {
  const $ = cheerio.load(html);
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  $("li.b_algo").each((_i, node) => {
    const a = $(node).find("h2 a").first();
    const title = a.text().replace(/\s+/g, " ").trim();
    const url = decodeBingUrl(a.attr("href") ?? "");
    if (!title || !/^https?:\/\//.test(url) || seen.has(url)) return;
    if (/^https?:\/\/(www\.)?bing\.com\//i.test(url)) return;
    seen.add(url);
    out.push({ title, url });
  });
  return out;
}

/** 一条新闻在探查源里的落点：按机构去重（同一家报了两条只算一家）。 */
export function matchHeat(hits: SearchHit[], ownByHost: ReadonlyMap<string, readonly string[]>): HeatMatch[] {
  const byOrg = new Map<string, HeatMatch>();
  for (const hit of hits) {
    let host: string;
    try {
      host = new URL(hit.url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }
    const source: HeatSource | null = heatSourceFor(host);
    if (!source) continue;
    const ownSourceIds = [...(ownByHost.get(source.host) ?? [])];
    const previous = byOrg.get(source.org);
    // 一家机构多条报道时留第一条，但「本站已采」的判定以该机构任一命中为准。
    if (previous) {
      for (const id of ownSourceIds) if (!previous.ownSourceIds.includes(id)) previous.ownSourceIds.push(id);
      previous.own = previous.ownSourceIds.length > 0;
      continue;
    }
    byOrg.set(source.org, {
      org: source.org, host, kind: source.kind, title: hit.title, url: hit.url,
      own: ownSourceIds.length > 0, ownSourceIds,
    });
  }
  return [...byOrg.values()];
}

/**
 * 本站日常采集的源所在的主机 → 这些源的 id。`feedUrl` 也要看：rss 信源没有 `url`，
 * 早先只读 `url` 会让所有 rss 源认不出自己。
 */
async function ownSourcesByHost(): Promise<Map<string, string[]>> {
  const rows = await sql<{ id: string; url: string | null }[]>`
    SELECT id, coalesce(config->>'url', config->>'feedUrl') AS url
    FROM sources WHERE enabled AND kind IN ('rss', 'web_list', 'json_list')`;
  const out = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.url) continue;
    try {
      const host = new URL(row.url.replace(/^https:\/\/r\.jina\.ai\//, "")).hostname.toLowerCase().replace(/^www\./, "");
      const source = heatSourceFor(host);
      if (!source) continue;
      out.set(source.host, [...(out.get(source.host) ?? []), row.id]);
    } catch {
      // A source address that does not parse simply contributes nothing.
    }
  }
  return out;
}

async function searchBing(query: string): Promise<SearchHit[]> {
  const endpoint = config.renderUrl;
  if (!endpoint) throw new Error("renderer 未配置（RENDER_URL）：二次热度探查需要 Playwright 容器");
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&form=QBRE&qs=n`;
  // RENDER_URL 指向完整的 /render 端点（见 .env），不再拼接路径。
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, waitMs: 1500 }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`renderer ${res.status}`);
  const page = (await res.json()) as { html?: unknown; error?: unknown };
  if (typeof page.html !== "string" || !page.html) throw new Error(`renderer 未返回页面：${String(page.error ?? "")}`);
  return parseBingResults(page.html);
}

/**
 * 探查一条新闻并落库。重复探查同一条是幂等的：heat_probes 按 article_id 覆盖。
 * 返回 null 表示这条文章没有可用的标题（已删除或为空），不算失败。
 */
export async function probeArticle(articleId: string): Promise<HeatResult | null> {
  const [article] = await sql<{ title: string }[]>`SELECT title FROM articles WHERE id = ${articleId}`;
  if (!article?.title?.trim()) return null;
  const query = heatQuery(article.title);
  if (query.length < 4) return null;

  let result: HeatResult;
  try {
    const hits = await searchBing(query);
    const matches = matchHeat(hits, await ownSourcesByHost());
    result = { query, total: hits.length, matches, hits: matches.filter((m) => !m.own).length };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 500);
    await sql`
      INSERT INTO heat_probes (article_id, query, status, error, attempted_at, finished_at)
      VALUES (${articleId}, ${query}, 'failed', ${message}, now(), now())
      ON CONFLICT (article_id) DO UPDATE SET status = 'failed', error = ${message},
        attempted_at = now(), finished_at = now()`;
    // 失败不动已有的 heat：上一次成功的数字比 0 更接近事实。
    return null;
  }

  await sql.begin(async (tx) => {
    // first_ok_at 只在第一次成功时写：它是事件热度的观测时刻，重复探查不能让它往后跑，
    // 否则 story_heat_hourly 每次重算都会漂移。
    await tx`
      INSERT INTO heat_probes (article_id, query, status, hits, total, matches, error, attempted_at, finished_at, first_ok_at)
      VALUES (${articleId}, ${query}, 'ok', ${result.hits}, ${result.total}, ${tx.json(result.matches as never)}, NULL, now(), now(), now())
      ON CONFLICT (article_id) DO UPDATE SET status = 'ok', query = ${query}, hits = ${result.hits},
        total = ${result.total}, matches = ${tx.json(result.matches as never)}, error = NULL,
        attempted_at = now(), finished_at = now(), first_ok_at = coalesce(heat_probes.first_ok_at, now())`;
    await setPublicationHeat(articleId, result.hits, tx);
  });
  return result;
}
