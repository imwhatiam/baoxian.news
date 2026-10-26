import { editionAt, gate, tag } from "./setup.ts";
// A selected item released across the daily edition time must appear in the next issue exactly once.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle, publishArticleTx } from "@aihot/backend/publication/publish";
import { composeDaily } from "@aihot/backend/reports/compose";
import { candidates } from "@aihot/backend/reports/edition";

const T = tag();
const SOURCE = `test-report-boundary-${T}`;

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
            VALUES (${SOURCE}, 'Report boundary test', 'rss', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await stopBoss();
  await closeDb();
});

async function analyzed(label: string, timelineAt: Date): Promise<string> {
  const { articleId, backfill } = await upsertMaterial({
    sourceId: SOURCE,
    url: `https://example.com/report-boundary-${T}-${label}`,
    title: `Report boundary ${label}`,
    bodyText: `Report boundary ${label} body`,
    bodyStatus: "ok",
    publishedAt: timelineAt,
    discoveredAt: timelineAt,
    via: "fetch",
  });
  assert.equal(backfill, false);
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'product', ${`标题 ${label}`}, ${`摘要 ${label}`}, 90, true)`;
  return articleId;
}

async function selected(label: string, timelineAt: Date, releasedAt: Date): Promise<string> {
  const articleId = await analyzed(label, timelineAt);
  const published = await publishArticle(articleId, { now: releasedAt, releasedAt });
  assert.equal(published?.selected, true);
  return articleId;
}

test("reports assign delayed and boundary releases to the period readers first see them", async () => {
  // A day's window ends at its collection (03:00), so on time, delayed and at the boundary are measured from there.
  const cutoff = editionAt("daily", "2020-01-02", -5 * 3600);
  const at = (seconds: number) => new Date(cutoff.getTime() + seconds * 1000);
  const onTime = await selected("on-time", at(-120), at(-60));
  const delayed = await selected("delayed", at(-60), at(120));
  const atBoundary = await selected("at-boundary", at(-60), at(0));
  const groupedBefore = await analyzed("grouped-before", at(-120));
  await publishArticle(groupedBefore, { now: at(-120) });
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = ${at(-60)} WHERE id = ${groupedBefore}`;
  await publishArticle(groupedBefore, { now: at(-50) });
  const groupedLate = await analyzed("grouped-late", at(-120));
  await publishArticle(groupedLate, { now: at(-120) }); // waits for identity confirmation
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = ${at(-10)} WHERE id = ${groupedLate}`;
  const boundary = cutoff;
  const previous = new Set((await candidates(at(-86400), boundary)).map((c) => c.itemId));

  assert.equal(previous.has(onTime), true);
  assert.equal(previous.has(groupedBefore), true);
  for (const id of [delayed, atBoundary, groupedLate]) assert.equal(previous.has(id), false);

  await composeDaily("2020-01-02");
  await publishArticle(groupedLate, { now: editionAt("daily", "2020-01-02", 10) });
  const [release] = await sql<{ visible_after: Date }[]>`SELECT visible_after FROM publications WHERE article_id = ${groupedLate}`;
  assert.equal(release!.visible_after.toISOString(), editionAt("daily", "2020-01-02", 10).toISOString());
  const next = new Set((await candidates(boundary, at(86400))).map((c) => c.itemId));
  assert.equal(next.has(onTime), false);
  assert.equal(next.has(groupedBefore), false);
  for (const id of [delayed, atBoundary, groupedLate]) assert.equal(next.has(id), true);
  await composeDaily("2020-01-03");
  const reports = await sql<{ key: string; content: { sections: Array<{ items: Array<{ itemId: string }> }>; flashes: Array<{ itemId: string }> } }[]>`
    SELECT key, content FROM reports WHERE kind = 'daily' AND key IN ('2020-01-02', '2020-01-03')`;
  // An issue carries an item as an entry or as a flash (one source fills at most two entries).
  const items = (key: string) => {
    const content = reports.find((r) => r.key === key)!.content;
    return new Set([...content.sections.flatMap((s) => s.items), ...content.flashes].map((i) => i.itemId));
  };
  assert.equal(items("2020-01-02").has(onTime), true);
  assert.equal(items("2020-01-02").has(groupedBefore), true);
  assert.equal(items("2020-01-02").has(delayed), false);
  assert.equal(items("2020-01-02").has(atBoundary), false);
  assert.equal(items("2020-01-02").has(groupedLate), false);
  assert.equal(items("2020-01-03").has(onTime), false);
  assert.equal(items("2020-01-03").has(groupedBefore), false);
  assert.equal(items("2020-01-03").has(delayed), true);
  assert.equal(items("2020-01-03").has(atBoundary), true);
  assert.equal(items("2020-01-03").has(groupedLate), true);
});

/** Observe an actual PostgreSQL lock wait before advancing the clock or releasing the transaction. */
async function waitForBlocked(blocker: number, operation: Promise<unknown>) {
  const deadline = performance.now() + 5_000;
  while (!(await sql`SELECT 1 FROM pg_stat_activity WHERE ${blocker} = ANY(pg_blocking_pids(pid))`)[0]) {
    if (performance.now() >= deadline) assert.fail("operation did not wait for the held transaction");
    await Promise.race([operation.then(() => assert.fail("operation finished before the held transaction committed")), delay(10)]);
  }
}

for (const lock of ["article", "fact seat", "report snapshot"] as const) {
  test(`a release waiting for the ${lock} lock uses the time after the cutoff`, async (t) => {
    const id = await analyzed(`waiting-${lock}`, editionAt("daily", "2020-01-02", -120));
    await publishArticle(id, { now: editionAt("daily", "2020-01-02", -120) });
    await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = ${editionAt("daily", "2020-01-02", -60)} WHERE id = ${id}`;
    const [fact] = lock === "fact seat" ? await sql<{ id: number }[]>`INSERT INTO facts (public_id, title) VALUES (${`report-seat-${T}`}, 'fact') RETURNING id` : [];
    if (fact) await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact.id}, ${id}, 'report')`;
    const acquired = gate<number>();
    const release = gate();
    const holding = sql.begin(async (tx) => {
      if (lock === "article") await tx`SELECT 1 FROM articles WHERE id = ${id} FOR UPDATE`;
      else if (fact) await tx`SELECT pg_advisory_xact_lock(hashtext(${`seat:${fact.id}`}))`;
      else await tx`SELECT pg_advisory_xact_lock(hashtext('report_candidates'))`;
      const [row] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      acquired.open(row!.pid);
      await release.promise;
    });
    let publication: Promise<unknown> | undefined;
    try {
      const pid = await Promise.race([acquired.promise, holding.then(() => assert.fail("lock holder exited before acquiring its lock"))]);
      t.mock.timers.enable({ apis: ["Date"], now: editionAt("daily", "2020-01-02", -1) });
      publication = publishArticle(id);
      await waitForBlocked(pid, publication);
      t.mock.timers.setTime(editionAt("daily", "2020-01-02", 10).getTime());
      release.open();
      await holding;
      await publication;

      const [published] = await sql<{ visible_after: Date; visible_at: Date }[]>`
        SELECT p.visible_after, l.visible_at FROM publications p JOIN selected_ledger l ON l.article_id = p.article_id
        WHERE p.article_id = ${id} ORDER BY l.seq DESC LIMIT 1`;
      assert.equal(published!.visible_after.toISOString(), editionAt("daily", "2020-01-02", 10).toISOString());
      assert.equal(published!.visible_at.toISOString(), published!.visible_after.toISOString());
      const boundary = editionAt("daily", "2020-01-02");
      assert.equal((await candidates(editionAt("daily", "2020-01-01"), boundary)).some((c) => c.itemId === id), false);
      assert.equal((await candidates(boundary, editionAt("daily", "2020-01-03"))).some((c) => c.itemId === id), true);
    } finally {
      release.open();
      await Promise.allSettled([holding, publication]);
    }
  });
}

test("daily composition waits for a pre-cutoff release to commit instead of losing it between issues", async (t) => {
  // The window ends at the day's collection (03:00): the release is inside it but commits after the issue starts.
  const cutoff = editionAt("daily", "2020-01-04", -5 * 3600);
  const at = (seconds: number) => new Date(cutoff.getTime() + seconds * 1000);
  const id = await analyzed("commit-after-cutoff", at(-120));
  await publishArticle(id, { now: at(-120) });
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = ${at(-60)} WHERE id = ${id}`;
  t.mock.timers.enable({ apis: ["Date"], now: at(-1) });
  const written = gate<number>();
  const commit = gate();
  const publication = sql.begin(async (tx) => {
    await publishArticleTx(tx, id);
    const [row] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    written.open(row!.pid);
    await commit.promise;
  });
  let report: ReturnType<typeof composeDaily> | undefined;
  try {
    const pid = await Promise.race([written.promise, publication.then(() => assert.fail("publication exited before the commit gate"))]);
    t.mock.timers.setTime(editionAt("daily", "2020-01-04", 10).getTime());
    report = composeDaily("2020-01-04");
    await waitForBlocked(pid, report);
    commit.open();
    await publication;
    await report;
    // The next day's window holds nothing at all: it is a quiet issue, and the article is not in it.
    await composeDaily("2020-01-05");
    const reports = await sql<{ key: string; content: { sections: Array<{ items: Array<{ itemId: string }> }> } }[]>`
      SELECT key, content FROM reports WHERE kind = 'daily' AND key IN ('2020-01-04', '2020-01-05')`;
    const hasItem = (key: string) => reports.find((r) => r.key === key)!.content.sections.some((s) => s.items.some((item) => item.itemId === id));
    assert.equal(hasItem("2020-01-04"), true);
    assert.equal(reports.some((r) => r.key === "2020-01-05"), true);
    assert.equal(hasItem("2020-01-05"), false);
    assert.equal((await candidates(cutoff, at(86400))).some((c) => c.itemId === id), false);
  } finally {
    commit.open();
    await Promise.allSettled([publication, report]);
  }
});
