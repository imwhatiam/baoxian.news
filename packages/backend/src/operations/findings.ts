// What the operations checks report: one finding per problem, worded for whoever has to act.
// There is no external channel any more: alerts are written to the process log and shown in the
// admin's 运行 page, and nothing leaves the process.
import { beijingStamp } from "@aihot/contracts/time";

/** How urgent: readers affected now, money or the owner's hands today, or a follow-up that can wait. */
export type Level = "now" | "today" | "later";

export interface Finding {
  key: string;
  level: Level;
  /** Plain words: no queue, unit or table names. */
  title: string;
  /** What readers see, or what it costs. */
  impact?: string;
  /** Whether it heals by itself. */
  heals?: string;
  /** What has to be done. */
  action?: string;
  /** Facts for whoever looks into it: the digest lists them, an alert never carries them. */
  detail?: string;
  /** When the problem began, when known; otherwise when it was first seen. */
  since?: Date;
  /** New evidence after a dated closure reopens a source follow-up under the same key. */
  observedAt?: Date;
}

const MARK: Record<Exclude<Level, "later">, string> = { now: "🔴", today: "🟠" };

export function duration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} 分钟`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} 小时${min % 60 ? ` ${min % 60} 分钟` : ""}`;
  return `${Math.floor(min / 1440)} 天`;
}

/** The message for an open problem: first notice or a repeat. */
export function formatAlert(f: Finding, since: Date, now: number, repeat = false): { title: string; lines: string[] } {
  const level = f.level === "later" ? "today" : f.level;
  const lasting = now - since.getTime() >= 60_000 ? `（已持续 ${duration(now - since.getTime())}）` : "";
  const lines = [f.impact && `影响：${f.impact}`, f.heals && `会自己好吗：${f.heals}`, f.action && `你需要：${f.action}`];
  return { title: `${MARK[level]} ${repeat ? "仍未恢复：" : ""}${f.title}${lasting}`, lines: lines.filter((l): l is string => !!l) };
}

export function formatRecovery(title: string, since: Date, now: number): { title: string; lines: string[] } {
  return { title: `✅ 已恢复：${title}`, lines: [`持续 ${duration(now - since.getTime())}（${beijingStamp(since)} 起）`] };
}

/** One line in the process log; the admin sees it there and in 运行. */
export async function logAlert(title: string, lines: string[]): Promise<void> {
  console.log(JSON.stringify({ level: "warn", msg: "alert", title, lines }));
}
