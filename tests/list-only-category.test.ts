// 只在分类页列出的类别（国际）：条目只在自己的分类下出现，不进首页精选、全部列表与搜索，
// 也不参与事件归组、二次热度探查、热度评选和日报候选。即使一条国际报道曾被判为精选，
// 读取层也不再展示它。
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@baoxian-news/backend/db";
import { upsertMaterial } from "@baoxian-news/backend/content/materials";
import { publishArticle } from "@baoxian-news/backend/publication/publish";
import { loadPool } from "@baoxian-news/backend/publication/pool";
import { loadTimeline } from "@baoxian-news/backend/publication/timeline";
import { candidates } from "@baoxian-news/backend/reports/edition";
import { currentSignals } from "@baoxian-news/backend/events/hot";
import { probeArticle } from "@baoxian-news/backend/heat/probe";
import { needsGrouping } from "@baoxian-news/backend/jobs/content";

after(async () => { await closeDb(); });

/** 一条发布完成的报道；判为精选、T1 源，确保它能过精选面。 */
async function report(category: string, title: string) {
  const sourceId = `list-only-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${sourceId},${title},'rss','T1','editorial')`;
  const { articleId } = await upsertMaterial({
    sourceId, url: `https://example.com/${sourceId}`, title, bodyText: "正文内容", bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  });
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,tags,title_zh,summary_zh,score,selected)
    VALUES (${articleId},1,'rule','pass',${category},ARRAY['其他'],${title},'摘要',90,true)`;
  await publishArticle(articleId, { releasedAt: new Date() });
  return { articleId, sourceId };
}

test("国际条目只在“国际”分类下列出，全部动态与精选流都不含它", async () => {
  const overseas = await report("international", "境外再保险监管新规");
  const domestic = await report("industry", "国内车险费率调整");
  const [saved] = await sql<{ selected: boolean }[]>`SELECT selected FROM publications WHERE article_id = ${overseas.articleId}`;
  assert.equal(saved!.selected, true, "发布层照常记录精选判断，展示口径在读取层");

  const all = await loadPool({ channel: "all", category: null, tag: null });
  assert.deepEqual(all.items.map((i) => i.id), [domestic.articleId], "全部动态只有计入运营的类别");
  const own = await loadPool({ channel: "all", category: "international", tag: null });
  assert.deepEqual(own.items.map((i) => i.id), [overseas.articleId], "“国际”分类下仍按时间列出");
  assert.equal(own.total, 1);

  const now = new Date(Date.now() + 60_000);
  const timeline = await loadTimeline({ channel: "all", category: null, tag: null, now });
  assert.deepEqual(timeline.cards.map((c) => c.item.id), [domestic.articleId], "精选流不含国际");

  const period = await candidates(new Date(Date.now() - 3_600_000), new Date(Date.now() + 3_600_000));
  assert.deepEqual(period.map((c) => c.itemId), [domestic.articleId], "日报候选不含国际");
});

test("国际条目现有的热度证据不再计入评选，也不再派发二次探查", async () => {
  const overseas = await report("international", "境外保险公司财报");
  const domestic = await report("industry", "国内保险公司财报");
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id,title) VALUES (gen_random_uuid(),'一个事件') RETURNING id`;
  for (const r of [overseas, domestic]) {
    const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id,title,story_id) VALUES (${`f-${tag()}`},'同一件事',${story!.id}) RETURNING id`;
    await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${r.articleId},'report')`;
    await sql`INSERT INTO story_signals (story_id,article_id,participant_key,source_id,kind,observed_at)
      VALUES (${story!.id},${r.articleId},${`source:${r.sourceId}`},${r.sourceId},'editorial',now())`;
  }
  const signals = await sql<{ article_id: string }[]>`SELECT article_id FROM ${currentSignals()} cs ORDER BY article_id`;
  assert.deepEqual(signals.map((s) => s.article_id), [domestic.articleId], "存量的国际信号保留在表里，但不进热度口径");

  assert.equal(await probeArticle(overseas.articleId), null, "国际条目不派发探查");
  assert.equal((await sql`SELECT 1 FROM heat_probes WHERE article_id = ${overseas.articleId}`).length, 0);

  assert.equal(needsGrouping({ participationMode: "editorial", historical: false, relevance: "pass", category: "international" }), false);
  assert.equal(needsGrouping({ participationMode: "editorial", historical: false, relevance: "pass", category: "industry" }), true);
});
