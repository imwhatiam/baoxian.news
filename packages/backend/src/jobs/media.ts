// Image renditions prepared ahead of a reader: every rendition a newly selected item's card and page
// ask the image proxy for, and the still conversion of an animated image the proxy meets on request.
import type { PgBoss } from "pg-boss";
import { convertAnimated } from "../media/images.ts";
import { prepareArticleMedia } from "../media/prepare.ts";
import { QUEUES, work } from "./queue.ts";

export async function registerMediaJobs(boss: PgBoss) {
  await work(boss, QUEUES.prepareMedia, { localConcurrency: 1, pollingIntervalSeconds: 5 }, async (data) =>
    "articleId" in data ? prepareArticleMedia(data.articleId) : { animatedSaved: await convertAnimated(data.url, data.mode) });
}
