// Failure cases: a category correction leaves frozen daily/weekly/monthly columns stale, rewrites the
// lead or selection, triggers a paid digest, leaves an obsolete section introduction, or commits
// without its audit/revision. The insurance pack has no headline launch kind (RELEASE), so its issues
// carry no release figure to recount.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { overrideFields } from "@aihot/backend/admin/content";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { dailyMetrics } from "@aihot/backend/reports/compose";
import type { EditionEntry } from "@aihot/backend/reports/edition";
import { QUEUES, getBoss, stopBoss } from "@aihot/backend/jobs/queue";

after(async () => { await stopBoss(); await closeDb(); });

test("an industry without a headline launch kind counts events, sources and first-hand reports only", () => {
  const base = { category: "product", tags: ["产品发布"], authority: 0, previous: null,
    entry: { sourceId: "official", firstParty: true } } as unknown as EditionEntry;
  const rows: EditionEntry[] = [base, { ...base, tags: ["费率调整"] },
    { ...base, entry: { ...base.entry, sourceId: "media", firstParty: false } }];
  const metrics = dailyMetrics(rows);
  assert.equal("modelsReleased" in metrics, false, "the insurance pack sets no RELEASE kind");
  assert.deepEqual([metrics.totalEvents, metrics.sourcesCount, metrics.firstPartyEvents], [3, 2, 2]);
});

test("category corrections revise every standard report atomically without selecting, rewriting or notifying", async () => {
  await getBoss(); // the digest check below reads the job table
  const sourceId = `category-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${sourceId},'Category fixture','rss','T1','editorial')`;
  const { articleId } = await upsertMaterial({ sourceId, url: `https://example.com/${sourceId}`, title: "境外再保险新规", bodyText: "正文", bodyStatus: "ok", via: "fetch", publishedAt: new Date() });
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,tags,title_zh,summary_zh,score,selected)
    VALUES (${articleId},1,'rule','pass','product',ARRAY['产品发布','再保险'],'境外再保险新规','冻结摘要',88,true)`;
  const [story] = await sql`INSERT INTO stories (public_id,title) VALUES (gen_random_uuid(),'再保险事件') RETURNING id`;
  const [fact] = await sql`INSERT INTO facts (public_id,title,story_id) VALUES (${`f-${tag()}`},'再保险新规',${story!.id}) RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${articleId},'report')`;
  await publishArticle(articleId, { releasedAt: new Date() });
  const entry = { itemId: articleId, title: "冻结标题", summary: "冻结摘要", sourceId, firstParty: true, role: "官方" };
  // The sections a daily and a period carry are the pack's own (product → 产品与定价). A correction to
  // 国际 moves the frozen entry, with no release figure to recount.
  const contents = [
    { kind: "daily", key: "2097-01-02", content: { leadItemId: articleId, lead: { title: "冻结头条" }, highlights: [articleId], flashes: [], sections: [{ label: "产品与定价", items: [entry] }], metrics: { totalEvents: 1, firstPartyEvents: 1 } } },
    ...(["weekly", "monthly"] as const).map(kind => ({ kind, key: kind === "weekly" ? "2097-W01" : "2097-01", content: { headline: "冻结头条", leadItemId: articleId, storyOrder: [articleId], overview: "保留总述", themes: [{ heading: "产品与定价", summary: "旧产品导读", storyRefs: [entry] }], metrics: { totalStories: 1 } } })),
  ];
  for (const r of contents) await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,origin)
    VALUES (${r.kind},${r.key},now(),now(),${sql.json(r.content as never)},now(),'imported')`;
  const [before] = await sql`SELECT selected,seat,score,visible_after,selected_ready_at FROM publications WHERE article_id=${articleId}`;
  const change = (actor: string) => overrideFields(articleId, { fields: { category: "international", tags: ["国际动态", "再保险"] }, version: 0, reason: "境外市场，不是产品" }, actor);
  await sql.unsafe(`CREATE FUNCTION reject_category_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.actor = 'reject-category' THEN RAISE EXCEPTION 'category audit rejected'; END IF; RETURN NEW; END $$`);
  await sql.unsafe("CREATE TRIGGER reject_category_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_category_audit()");
  try {
    await assert.rejects(change("reject-category"), /category audit rejected/);
    assert.equal((await sql`SELECT category FROM publications WHERE article_id=${articleId}`)[0]!.category, "product");
    assert.equal((await sql`SELECT 1 FROM report_revisions WHERE report_id IN (SELECT id FROM reports WHERE key IN ('2097-01-02','2097-W01','2097-01'))`).length, 0);
  } finally {
    await sql.unsafe("DROP TRIGGER reject_category_audit ON audit_log; DROP FUNCTION reject_category_audit()");
  }
  const digestCount = (await sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name=${QUEUES.digest}`)[0]!.n;
  await change("test-category");
  for (const r of contents) {
    const [saved] = await sql`SELECT content,revision FROM reports WHERE kind=${r.kind} AND key=${r.key}`;
    assert.equal(saved!.revision, 2);
    const c = saved!.content;
    assert.equal(c.leadItemId, articleId);
    if (r.kind === "daily") {
      assert.deepEqual(c.sections, [{ label: "国际", items: [entry] }]);
      assert.deepEqual(c.metrics, { totalEvents: 1, firstPartyEvents: 1 }, "an industry without a launch kind has no figure to recount");
      assert.deepEqual(c.highlights, [articleId]);
      assert.equal(c.lead.title, "冻结头条");
    } else {
      assert.deepEqual(c.themes, [{ heading: "国际", summary: null, storyRefs: [entry] }]);
      assert.deepEqual(c.storyOrder, [articleId]);
      assert.equal(c.overview, "保留总述");
    }
  }
  assert.deepEqual((await sql`SELECT selected,seat,score,visible_after,selected_ready_at FROM publications WHERE article_id=${articleId}`)[0], before);
  assert.equal((await sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name=${QUEUES.digest}`)[0]!.n, digestCount);
  await overrideFields(articleId, { fields: {}, clear: ["category", "tags"], version: 1, reason: "验证撤销纠错" }, "test-category");
  const [restored] = await sql`SELECT content FROM reports WHERE kind='daily' AND key='2097-01-02'`;
  assert.equal(restored!.content.sections[0].label, "产品与定价");
  assert.deepEqual(restored!.content.metrics, { totalEvents: 1, firstPartyEvents: 1 });
});
