// 手动跑二次热度探查（开发 / 运维用），并回填 publications.heat。
// node --env-file=.env scripts/probe-heat.ts <articleId> [...]
//
// 不给 articleId 时，挑最近 20 条已选中、还没探查过的文章跑一遍。
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { probeArticle } from "@aihot/backend/heat/probe";

const ids = process.argv.slice(2);
const targets = ids.length
  ? ids
  : (await sql<{ article_id: string }[]>`
      SELECT p.article_id FROM publications p
      LEFT JOIN heat_probes h ON h.article_id = p.article_id
      WHERE p.selected AND p.visibility = 'public' AND h.article_id IS NULL
      ORDER BY p.timeline_at DESC LIMIT 20`).map((r) => r.article_id);

for (const id of targets) {
  const started = performance.now();
  const r = await probeArticle(id);
  console.log(JSON.stringify({
    articleId: id,
    query: r?.query ?? null,
    hits: r?.hits ?? null,
    total: r?.total ?? null,
    matches: r?.matches.map((m) => `${m.org}${m.own ? "(本站已采)" : ""}`) ?? [],
    ms: Math.round(performance.now() - started),
  }));
}
await stopBoss();
await closeDb();
