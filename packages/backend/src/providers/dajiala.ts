// Dajiala (极致了) WeChat official-account data. Paid per request (post_history ¥0.14, article_detail
// ¥0.03); every call goes through receipts and the budget, and the provider's own cost_money is kept
// as the actual cost. Docs: https://s.apifox.cn/410674f9-f451-4b4f-957a-5f54f243bc83
import { credential } from "../config.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { assertAccepted, paidRequest, ProviderRejectedError, type CallOutcome } from "./receipts.ts";

export interface MpPost {
  position: number;
  url: string;
  title: string;
  post_time: number;
  digest?: string;
  sn?: string;
  cover_url?: string;
  original?: number;
  item_show_type?: number;
  appmsgid?: number;
  /** Displayed read count, capped by WeChat at 100001 (「10万+」). */
  read?: number;
  zan?: number;
}

export interface MpHistory {
  posts: MpPost[];
  nickname: string | null;
  remainMoney: number | null;
  /** The cursor for the next page; empty once the list ended. */
  offset: string;
  /** The account has no older posts: stop instead of paying for an empty page. */
  isEnd: boolean;
  receiptId: number;
  reused: boolean;
}

export interface MpArticle {
  title: string;
  content: string;
  author: string | null;
  desc: string | null;
  pubtime: string | null;
  receiptId: number;
}

/**
 * Whether WeChat accounts are checked through Dajiala: only with DAJIALA_KEY. The scheduled checks and
 * their queue run only then.
 */
export function dajialaConfigured(): boolean {
  return credential("collectors", "DAJIALA_KEY") !== null;
}

function base(): { url: string; key: string } {
  const key = credential("collectors", "DAJIALA_KEY");
  if (!key) throw new Error("DAJIALA_KEY is not configured");
  return { url: (credential("collectors", "DAJIALA_BASE_URL") ?? "https://www.dajiala.com").replace(/\/$/, ""), key };
}

/**
 * Code 110 ("no posts inside the page") is how the list call says the account published nothing since
 * the last check. It is a successful check with nothing new: failing it would buy the same empty answer
 * again on every retry, every 15 minutes, for as long as the account stays quiet.
 */
const CODE_NO_POSTS = 110;
/** The account has no balance left: every later call is refused the same way until it is topped up. */
const CODE_NO_BALANCE = 20001;

/** Provider codes: -1 rate limit (retry later); 20001 balance; 101/104/107 account gone; others rejected. */
function outcomeOf(json: { code?: number; msg?: string; cost_money?: number }, label: string): CallOutcome["cost"] {
  const code = Number(json.code ?? 0);
  if (code === -1) throw new ProviderRejectedError(`dajiala ${label}: rate limited`, 429, true);
  // An empty account cannot answer any account's list call: say it the way the receipt layer reads a
  // spending refusal (HTTP 402), so it stops new calls for the cooldown instead of failing every pass.
  if (code === CODE_NO_BALANCE) throw new ProviderRejectedError(`dajiala ${label} HTTP 402: ${json.msg ?? "balance exhausted"} (code ${code})`, 402, false, true);
  if (code !== 0) throw new ProviderRejectedError(`dajiala ${label} code ${code}: ${json.msg ?? ""}`.trim(), code, false);
  return charged(json);
}

/** What the provider says it charged, when it says. */
function charged(json: { cost_money?: number }): CallOutcome["cost"] {
  return typeof json.cost_money === "number" ? { amount: json.cost_money, currency: "CNY", basis: "actual" } : null;
}

/**
 * One page of an account's posts, newest first. `offset` is the cursor the previous page returned ("" for
 * the first page) and is part of the receipt identity: without it every page of one window would answer
 * with the first page's cached body. `window` buckets the receipt identity.
 */
export async function mpHistory(ghid: string, opts: { subject: string; window: string; offset?: string }): Promise<MpHistory> {
  const { url, key } = base();
  const offset = opts.offset ?? "";
  const receipt = await paidRequest(
    { service: "dajiala", purpose: "mp_history", subject: opts.subject, identity: { ghid, window: opts.window, offset }, requestSummary: { ghid, offset } },
    async () => {
      const res = await guardedFetch(`${url}/fbmain/monitor/v3/post_history`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ghid, key, verifycode: "", offset }),
        timeoutMs: 30_000,
        route: "direct",
      });
      const text = res.text();
      assertAccepted("dajiala", res.status, text);
      const json = JSON.parse(text) as { code?: number; msg?: string; cost_money?: number };
      if (Number(json.code) === CODE_NO_POSTS) return { response: { ...json, data: [] }, cost: charged(json), usage: { posts: 0 } };
      const cost = outcomeOf(json, "post_history");
      return { response: json, cost, usage: { posts: Array.isArray((json as { data?: unknown[] }).data) ? (json as { data: unknown[] }).data.length : 0 } };
    },
  );
  const json = receipt.response as { data?: MpPost[]; nickname?: string; remain_money?: number; offset?: string; is_end?: number };
  return {
    posts: json.data ?? [],
    nickname: json.nickname ?? null,
    remainMoney: json.remain_money ?? null,
    offset: json.offset ?? "",
    isEnd: Number(json.is_end ?? 1) === 1,
    receiptId: receipt.receiptId,
    reused: receipt.reused,
  };
}

/** Plain-text body of one article (mode 1: text with image markers). */
export async function mpArticle(articleUrl: string, opts: { subject: string; identity: string }): Promise<MpArticle> {
  const { url, key } = base();
  const receipt = await paidRequest(
    { service: "dajiala", purpose: "mp_article", subject: opts.subject, identity: { article: opts.identity }, requestSummary: { url: articleUrl } },
    async () => {
      const res = await guardedFetch(`${url}/fbmain/monitor/v3/article_detail?${new URLSearchParams({ url: articleUrl, key, mode: "1", verifycode: "" })}`, {
        redirectPolicy: "same-origin",
        headers: { accept: "application/json" },
        timeoutMs: 30_000,
        maxBytes: 8 * 1024 * 1024,
        route: "direct",
      });
      const text = res.text();
      assertAccepted("dajiala", res.status, text);
      const json = JSON.parse(text) as { code?: number; msg?: string; cost_money?: number };
      const cost = outcomeOf(json, "article_detail");
      return { response: json, cost, usage: { chars: String((json as { content?: string }).content ?? "").length } };
    },
  );
  const j = receipt.response as { title?: string; content?: string; author?: string; desc?: string; pubtime?: string };
  return { title: j.title ?? "", content: j.content ?? "", author: j.author || null, desc: j.desc || null, pubtime: j.pubtime ?? null, receiptId: receipt.receiptId };
}
