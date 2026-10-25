// WeChat official accounts. Dajiala (极致了, a paid service) supplies each account's latest posts, and
// an article body only when the page itself does not carry one; every enabled account is checked once
// per source interval.
import { COLLECT_TIMES } from "@aihot/site";
import { beijingAt, beijingDate } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { upsertMaterial } from "../content/materials.ts";
import { enqueue, QUEUES } from "../jobs/queue.ts";
import { queueProcessing } from "../jobs/content.ts";
import { stripTags } from "../lib/text.ts";
import { sanitizeBody } from "../content/sanitize.ts";
import { identityKeyForUrl } from "../lib/url.ts";
import { contentDocument } from "../lib/page-content.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { dajialaConfigured, mpArticle, mpHistory } from "../providers/dajiala.ts";
import { failureKind } from "../providers/receipts.ts";

const MAX_NEW_PER_CHECK = 8;
/** Posts older than this on the first check of an account are history, not news. */
const FIRST_CHECK_WINDOW_MS = 7 * 86400_000;
/** A body missing for a passing reason is fetched again on later checks: this often, while the post is this recent. */
const BODY_RETRIES = 3;
const BODY_RETRY_WINDOW_MS = 3 * 86400_000;
/** Consecutive checks that find nothing before an account reads as broken rather than quiet. */
const EMPTY_CHECKS_BEFORE_DEGRADED = 7;

/** A shorter body is a deleted post, a verification interstitial or a template: ask Dajiala instead. */
const MIN_PAGE_BODY_CHARS = 200;

interface MpBody {
  content: string;
  author: string | null;
  desc: string | null;
  /** Taken from the article page itself, so no paid call was made. */
  local: boolean;
}

/**
 * The body straight from the article page. WeChat serves articles as public server-rendered HTML whose
 * `#js_content` holds the same text Dajiala's mode 1 returns (measured equal on 20 accounts), so the
 * paid call is only the fallback. Read from the container rather than `extractFromUrl`: that page also
 * carries megabytes of inline script, on which Readability gives up and returns null. Null here means
 * "ask Dajiala" — a deleted post, a verification interstitial, or markup that changed.
 */
export async function fetchPageBody(url: string): Promise<MpBody | null> {
  try {
    const res = await guardedFetch(url, { timeoutMs: 20_000, maxBytes: 6 * 1024 * 1024 });
    if (res.status !== 200) return null;
    const document = contentDocument(res.text());
    const content = document.querySelector("#js_content");
    if (!content) return null;
    for (const node of content.querySelectorAll("script, style")) node.remove();
    const html = content.innerHTML ?? "";
    if (stripTags(html).trim().length < MIN_PAGE_BODY_CHARS) return null;
    return {
      content: html,
      author: document.querySelector("#js_name")?.textContent?.trim() || null,
      desc: document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || null,
      local: true,
    };
  } catch {
    return null;
  }
}

/** The article body, and when it is missing for a reason that may pass (rate limit, server error, lost answer), that reason. */
async function fetchBody(url: string, sourceId: string, identity: string): Promise<{ body: MpBody | null; passing: string | null }> {
  const local = await fetchPageBody(url);
  if (local) return { body: local, passing: null };
  try {
    const paid = await mpArticle(url, { subject: sourceId, identity });
    return { body: { content: paid.content, author: paid.author, desc: paid.desc, local: false }, passing: null };
  } catch (error) {
    const kind = failureKind(error);
    if (kind === "budget") throw error;
    return { body: null, passing: kind === "refused" ? null : String(error instanceof Error ? error.message : error).slice(0, 200) };
  }
}

interface MpSource {
  id: string;
  name: string;
  config: { wxid?: string; ghid?: string; nickname?: string; maxNewPerCheck?: number };
  cursor: Record<string, unknown> | null;
  enabled: boolean;
  participation_mode: string;
}

export async function checkMpAccount(sourceId: string, reason: "schedule" | "manual") {
  const [source] = await sql<MpSource[]>`SELECT id, name, config, cursor, enabled, participation_mode FROM sources WHERE id = ${sourceId} AND kind = 'mp_account'`;
  if (!source) return { sourceId, status: "missing" as const };
  if (!source.enabled && reason !== "manual") return { sourceId, status: "paused" as const };
  const ghid = source.config.ghid ?? source.config.wxid;
  if (!ghid) return { sourceId, status: "unconfigured" as const };
  const [run] = await sql<{ id: number }[]>`INSERT INTO fetch_runs (source_id, detail) VALUES (${sourceId}, ${sql.json({ reason })}) RETURNING id`;
  const firstCheck = !source.cursor?.lastCheckedAt;
  let created = 0;
  try {
    // One paid list call per account per 10-minute window, whoever asks.
    const window = `${reason === "schedule" ? "s" : "m"}:${Math.floor(Date.now() / 600_000)}`;
    const history = await mpHistory(ghid, { subject: sourceId, window });
    const posts = [...history.posts].sort((a, b) => b.post_time - a.post_time);
    // Per-source cap: how many new posts of one check get a (paid) body fetch.
    const cap = Number(source.config.maxNewPerCheck) > 0 ? Number(source.config.maxNewPerCheck) : MAX_NEW_PER_CHECK;
    let fetched = 0;
    for (const p of posts) {
      if (!p.url || !p.title || fetched >= cap) continue;
      const publishedAt = p.post_time ? new Date(p.post_time * 1000) : null;
      if (firstCheck && publishedAt && Date.now() - publishedAt.getTime() > FIRST_CHECK_WINDOW_MS) continue;
      // Same identity rule as every entrance: the long link without tracking parameters. A known post is
      // skipped, unless its body failed for a passing reason: then it is tried again a few times.
      const key = identityKeyForUrl(p.url);
      const [known] = key
        ? await sql<{ id: string; body_status: string; discovered_at: Date; retry: { attempts: number } | null }[]>`
            SELECT id, body_status, discovered_at, raw->'dajiala'->'bodyRetry' AS retry FROM articles WHERE identity_key = ${key} LIMIT 1`
        : [];
      const retryBody = !!known?.retry && known.body_status === "none" && known.retry.attempts < BODY_RETRIES && Date.now() - known.discovered_at.getTime() < BODY_RETRY_WINDOW_MS;
      if (known && !retryBody) continue;
      fetched += 1;
      // Without a body the post is listed anyway; analysis works from title and digest.
      const { body, passing } = await fetchBody(p.url, sourceId, p.sn ?? p.url);
      if (known && !body?.content) {
        const retry = passing ? sql`jsonb_set(raw, '{dajiala,bodyRetry}', ${sql.json({ attempts: known.retry!.attempts + 1, error: passing })})` : sql`raw #- '{dajiala,bodyRetry}'`;
        await sql`UPDATE articles SET raw = ${retry} WHERE id = ${known.id}`;
        continue;
      }
      // Mode 1 bodies are light HTML (paragraphs and image tags).
      const html = body?.content ? sanitizeBody(body.content, p.url) : null;
      const text = body?.content ? stripTags(body.content) : null;
      const res = await upsertMaterial({
        sourceId,
        url: p.url,
        title: p.title,
        author: body?.author ?? null,
        language: "zh",
        publishedAt,
        excerpt: p.digest ?? body?.desc ?? null,
        bodyHtml: html,
        bodyText: text || null,
        bodyStatus: text ? "ok" : "none",
        via: "fetch",
        backfill: firstCheck ? "first-import" : null,
        raw: {
          dajiala: {
            position: p.position, sn: p.sn ?? null, original: p.original ?? null, itemShowType: p.item_show_type ?? null, cover: p.cover_url ?? null,
            ...(body?.local ? { localBody: true } : {}),
            ...(passing ? { bodyRetry: { attempts: 1, error: passing } } : {}),
          },
        },
      });
      // A body fetched again arrives as a new revision (analysed again); stop retrying it.
      if (known) await sql`UPDATE articles SET raw = raw #- '{dajiala,bodyRetry}' WHERE id = ${known.id}`;
      if (res.created) created += 1;
      if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId);
    }
    // A check that finds nothing is not a failure, but a run of them is: an account whose ghid is
    // wrong answers "no posts" every time, and reading as healthy would hide it from the source page.
    const emptyChecks = emptyChecksAfter(source.cursor?.emptyChecks, posts.length);
    const quiet = emptyChecks >= EMPTY_CHECKS_BEFORE_DEGRADED;
    const cursor = {
      ...(source.cursor ?? {}), lastCheckedAt: new Date().toISOString(),
      lastPostTime: posts[0]?.post_time ?? source.cursor?.lastPostTime ?? null,
      // A check that found nothing may answer without the balance; keep the one last read.
      remainMoney: history.remainMoney ?? source.cursor?.remainMoney ?? null,
      emptyChecks,
    };
    await sql`
      UPDATE sources SET last_fetch_at = now(), last_ok_at = now(), fail_count = 0,
        last_error = ${quiet ? `连续 ${emptyChecks} 次检查没有文章，确认 ghid 是否正确、账号是否已停更` : null},
        health = ${quiet ? "degraded" : "ok"}, cursor = ${sql.json(cursor as never)},
        next_fetch_at = now() + make_interval(mins => interval_minutes), updated_at = now()
      WHERE id = ${sourceId}`;
    await sql`UPDATE fetch_runs SET status = 'ok', finished_at = now(), found_count = ${posts.length}, new_count = ${created} WHERE id = ${run!.id}`;
    return { sourceId, status: "ok" as const, found: posts.length, created, reused: history.reused };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 500);
    const kind = failureKind(error);
    const soft = kind === "budget" || kind === "outage";
    if (soft) {
      // Nothing reached the provider's answer: the queue retries, and the account stays due.
      await sql`UPDATE sources SET last_fetch_at = now(), last_error = ${message}, updated_at = now() WHERE id = ${sourceId}`;
    } else {
      // A check that ran is a check. Advancing lastCheckedAt keeps an account that answers the same
      // failure every time (a wrong ghid, an account gone, no balance) from buying a new list call on
      // every 15-minute pass; a refusal is visible at once instead of after three such paid attempts.
      const cursor = { ...(source.cursor ?? {}), lastCheckedAt: new Date().toISOString() };
      await sql`
        UPDATE sources SET last_fetch_at = now(), last_error = ${message},
          fail_count = fail_count + 1,
          health = ${kind === "refused" ? "failing" : sql`CASE WHEN fail_count + 1 >= 3 THEN 'failing' ELSE 'degraded' END`},
          cursor = ${sql.json(cursor as never)},
          next_fetch_at = now() + make_interval(mins => interval_minutes), updated_at = now()
        WHERE id = ${sourceId}`;
    }
    await sql`UPDATE fetch_runs SET status = 'failed', finished_at = now(), new_count = ${created}, error = ${message} WHERE id = ${run!.id}`;
    if (soft) throw error; // retried by the queue
    return { sourceId, status: "failed" as const, error: message };
  }
}

/**
 * The interval at or above which an account is read on the site's clock (dailyCheckAt) every whole
 * number of days, rather than one interval after its own last read: a read at 10:19 would reach only
 * the next day's issue, and a three-day account would walk later by a few minutes every cycle.
 */
const ANCHORED_INTERVAL_MINUTES = 1440;
/** One pass queues this many accounts: the paid list call allows 20 a minute and 60 an hour. */
const CHECKS_PER_PASS = 8;

/** The account's run of empty checks, after one that found `found` posts. */
export function emptyChecksAfter(previous: unknown, found: number): number {
  return found > 0 ? 0 : (Number(previous) || 0) + 1;
}

/** The daily read instant on `at`'s calendar day, in Beijing time: the site's daily collection time. */
export function dailyCheckAt(at: Date): Date {
  const [hour, minute] = COLLECT_TIMES.daily.split(":").map(Number) as [number, number];
  return new Date(beijingAt(beijingDate(at), "00:00").getTime() + (hour * 60 + minute) * 60_000);
}

/**
 * When an anchored account is due next: the daily instant on the day of its last read, plus its
 * interval in whole days. A read before that day's instant belongs to the previous day's slot, so a
 * manual read at 02:00 does not consume the 03:00 read. Counting from the slot rather than from the
 * run's finish keeps a slow run from walking the schedule later every cycle.
 */
export function nextCheckAt(last: Date, intervalMinutes: number): Date {
  const days = Math.max(1, Math.floor(intervalMinutes / ANCHORED_INTERVAL_MINUTES));
  const anchor = dailyCheckAt(last);
  const slot = last.getTime() >= anchor.getTime() ? anchor.getTime() : anchor.getTime() - 86_400_000;
  return new Date(slot + days * 86_400_000);
}

/** Whether one account is due: on the site's clock when its interval is a whole number of days. */
export function mpCheckDue(last: string | null, intervalMinutes: number, now: Date): boolean {
  const lastAt = last ? Date.parse(last) : Number.NaN;
  if (Number.isNaN(lastAt)) return true;
  if (intervalMinutes >= ANCHORED_INTERVAL_MINUTES) return now.getTime() >= nextCheckAt(new Date(lastAt), intervalMinutes).getTime();
  return now.getTime() - lastAt > intervalMinutes * 60_000;
}

/** Every enabled account is checked once per its interval, on the daily read instant when that is whole days. */
export async function scheduleMpReconcile(now = new Date()) {
  // Without Dajiala there is nothing to check the accounts with.
  if (!dajialaConfigured()) return { enqueued: 0 };
  // Longest untried first, so an account whose check keeps failing yields its turn to the others.
  const rows = await sql<{ id: string; last: string | null; interval_minutes: number }[]>`
    SELECT id, cursor->>'lastCheckedAt' AS last, interval_minutes FROM sources
    WHERE kind = 'mp_account' AND enabled ORDER BY last_fetch_at NULLS FIRST`;
  let enqueued = 0;
  for (const s of rows) {
    if (enqueued >= CHECKS_PER_PASS) break;
    if (!mpCheckDue(s.last, s.interval_minutes, now)) continue;
    if (await enqueue(QUEUES.mpCheck, { sourceId: s.id, reason: "schedule" }, { singletonKey: `mp:${s.id}` })) enqueued += 1;
  }
  return { enqueued };
}
