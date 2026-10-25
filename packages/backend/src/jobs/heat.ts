// 二次热度探查任务：一条新闻被选中后，用标题在 Bing 上再搜一次，把「还有几家在报」写进热度。
//
// 单独排队、低并发：一次渲染约 7 秒，并且 Bing 对连续请求有限流。探查失败不影响文章本身，
// 队列只重试一次（jobs/queue.ts 的 heatProbe 策略），heat 保持上一次成功的值。
import type { PgBoss } from "pg-boss";
import { probeArticle } from "../heat/probe.ts";
import { QUEUES, work } from "./queue.ts";

export async function registerHeatJobs(boss: PgBoss) {
  // 与 renderer 的并发（RENDER_CONCURRENCY，默认 2）错开：正文提取也要用这个容器。
  await work(boss, QUEUES.heatProbe, { localConcurrency: 1, pollingIntervalSeconds: 2 }, async ({ articleId }) => {
    const result = await probeArticle(articleId);
    return result ? { state: "ok", hits: result.hits, total: result.total } : { state: "skipped" };
  });
}
