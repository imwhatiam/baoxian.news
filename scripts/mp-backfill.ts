// 手动补录公众号历史文章（开发 / 运维用）。
//
//   node --env-file=.env scripts/mp-backfill.ts --per-source 50            # 真正入库
//   node --env-file=.env scripts/mp-backfill.ts --per-source 50 --dry       # 只翻页，不写库
//   node --env-file=.env scripts/mp-backfill.ts --sources id1,id2           # 只跑指定信源
//   node --env-file=.env scripts/mp-backfill.ts --paid-fallback             # 页面拿不到正文时才买
//
// 列表按 offset 续抓：游标存在 `sources.cursor.backfill.offset`，每跑完一个号写回，下次从这里继续，
// 已经买过的页不会再买。正文默认只从文章页取（0 元）；`--paid-fallback` 才允许调 article_detail（0.03 元/篇）。
// 入库走 upsertMaterial（via=import、backfill=reported-backfill），已知文章按 identity_key 跳过，
// 所以重复执行不会产生重复数据。
import { parseArgs } from "node:util";
import { beijingDate } from "@aihot/contracts/time";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { sanitizeBody } from "@aihot/backend/content/sanitize";
import { stripTags } from "@aihot/backend/lib/text";
import { identityKeyForUrl } from "@aihot/backend/lib/url";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { mpArticle, mpHistory, type MpPost } from "@aihot/backend/providers/dajiala";
import { fetchPageBody } from "@aihot/backend/sources/mp";

/** One page holds ten pushes of one to eight posts each, so 50 posts need at most five pages. */
const MAX_PAGES = 12;
/** 极致了 的上限是 3 次/秒。 */
const PAGE_DELAY_MS = 400;

const { values } = parseArgs({
  options: {
    "per-source": { type: "string", default: "50" },
    sources: { type: "string" },
    dry: { type: "boolean", default: false },
    "paid-fallback": { type: "boolean", default: false },
  },
});

const perSource = Number(values["per-source"]);
const dry = values.dry === true;
const paidFallback = values["paid-fallback"] === true;
const only = values.sources ? new Set(values.sources.split(",").map((s) => s.trim()).filter(Boolean)) : null;
/** Same-day retries reuse their receipts (free); another day pays again, which is what the cursor is for. */
const window = `bf:${beijingDate(new Date())}`;

interface Source {
  id: string;
  name: string;
  config: { ghid?: string; wxid?: string };
  cursor: { backfill?: { offset?: string; skip?: number; collected?: number; updatedAt?: string } } | null;
}

const sources = (await sql<Source[]>`
  SELECT id, name, config, cursor FROM sources
  WHERE kind = 'mp_account' AND enabled ORDER BY name`).filter((s) => !only || only.has(s.id));

console.log(`补录 ${sources.length} 个公众号，每个 ${perSource} 篇${dry ? "（dry run）" : ""}\n`);

let totalCreated = 0;
let totalPages = 0;
let totalLocal = 0;
let totalPaid = 0;
let totalNoBody = 0;
let totalSkipped = 0;

for (const source of sources) {
  const ghid = source.config.ghid ?? source.config.wxid;
  if (!ghid) {
    console.log(`${source.name}: 没有 ghid，跳过`);
    continue;
  }
  let offset = source.cursor?.backfill?.offset ?? "";
  /** Posts of `offset`'s page already stored by an earlier run that stopped inside it. */
  let skip = source.cursor?.backfill?.skip ?? 0;
  let created = 0;
  let pages = 0;
  let local = 0;
  let paid = 0;
  let noBody = 0;
  let skipped = 0;
  let stopOffset = offset;
  let stopSkip = skip;

  while (pages < MAX_PAGES && created < perSource) {
    const pageOffset = offset;
    let history: Awaited<ReturnType<typeof mpHistory>>;
    try {
      history = await mpHistory(ghid, { subject: source.id, window, offset });
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).slice(0, 120);
      // 余额耗尽这类全局问题继续跑也没有意义；单个号的临时失败只跳过它，游标不动，下次重试。
      if (/402|金额不足|balance/i.test(message)) throw error;
      console.log(`${source.name}: 列表请求失败，跳过（${message}）`);
      break;
    }
    pages += 1;
    if (!history.posts.length) {
      stopOffset = offset;
      stopSkip = 0;
      break;
    }

    let seen = 0;
    let taken = 0;
    let stoppedHere = false;
    for (const post of history.posts) {
      seen += 1;
      if (seen <= skip) continue;
      if (created >= perSource) {
        stoppedHere = true;
        break;
      }
      if (!post.url || !post.title) continue;
      const key = identityKeyForUrl(post.url);
      if (key) {
        const [known] = await sql`SELECT 1 FROM articles WHERE identity_key = ${key} LIMIT 1`;
        if (known) {
          skipped += 1;
          taken += 1;
          continue;
        }
      }
      if (dry) {
        created += 1;
        taken += 1;
        continue;
      }
      const stored = await ingest(source.id, post, ghid);
      created += 1;
      taken += 1;
      if (stored.body === "page") local += 1;
      else if (stored.body === "paid") paid += 1;
      else noBody += 1;
    }

    if (stoppedHere) {
      // Keep this page's cursor and remember how much of it is already stored, so the rest is not lost.
      stopOffset = pageOffset;
      stopSkip = skip + taken;
      break;
    }
    skip = 0;
    offset = history.offset;
    stopOffset = offset;
    stopSkip = 0;
    if (history.isEnd || !offset) break;
    await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
  }

  if (!dry && stopOffset) {
    const backfill = {
      offset: stopOffset,
      skip: stopSkip,
      collected: (source.cursor?.backfill?.collected ?? 0) + created,
      updatedAt: new Date().toISOString(),
    };
    await sql`UPDATE sources SET cursor = coalesce(cursor, '{}'::jsonb) || ${sql.json({ backfill })} WHERE id = ${source.id}`;
  }

  totalCreated += created;
  totalPages += pages;
  totalLocal += local;
  totalPaid += paid;
  totalNoBody += noBody;
  totalSkipped += skipped;
  console.log(
    `${source.name.slice(0, 14).padEnd(14)} 新增 ${String(created).padStart(2)} 篇 / ${pages} 页` +
      `，正文 页面 ${local} · 付费 ${paid} · 缺 ${noBody}，已知跳过 ${skipped}`,
  );
}

console.log(`\n合计：${totalPages} 页（约 ${(totalPages * 0.14).toFixed(2)} 元列表费），新增 ${totalCreated} 篇`);
console.log(`正文来源：页面 ${totalLocal} · 付费 ${totalPaid} · 缺失 ${totalNoBody}；已知跳过 ${totalSkipped}`);
if (dry) console.log("dry run：没有写库，也没有写回游标");

/** One post: the page's own body, Dajiala only when allowed, then the stored article. */
async function ingest(sourceId: string, post: MpPost, ghid: string): Promise<{ body: "page" | "paid" | "none" }> {
  const page = await fetchPageBody(post.url);
  let content = page?.content ?? null;
  let body: "page" | "paid" | "none" = page ? "page" : "none";
  if (!content && paidFallback) {
    try {
      const bought = await mpArticle(post.url, { subject: sourceId, identity: `bf:${ghid}:${post.sn ?? post.url}` });
      content = bought.content || null;
      if (content) body = "paid";
    } catch {
      // 拿不到就按缺失入库，下一轮再说。
    }
  }
  const html = content ? sanitizeBody(content, post.url) : null;
  const text = content ? stripTags(content) : null;
  const res = await upsertMaterial({
    sourceId,
    url: post.url,
    title: post.title,
    author: page?.author ?? null,
    language: "zh",
    publishedAt: post.post_time ? new Date(post.post_time * 1000) : null,
    excerpt: post.digest || page?.desc || null,
    bodyHtml: html,
    bodyText: text || null,
    bodyStatus: text ? "ok" : "none",
    via: "import",
    backfill: "reported-backfill",
    raw: {
      dajiala: {
        position: post.position, sn: post.sn ?? null, original: post.original ?? null,
        itemShowType: post.item_show_type ?? null, cover: post.cover_url ?? null,
        appmsgid: post.appmsgid ?? null, read: post.read ?? null, zan: post.zan ?? null,
        ...(body === "page" ? { localBody: true } : {}),
        ...(body === "paid" ? { paidBody: true } : {}),
      },
    },
  });
  if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId);
  return { body };
}

await stopBoss();
await closeDb();
