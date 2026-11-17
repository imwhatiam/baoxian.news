// Renames the legacy `_aihot` key in sources.config to `_baoxian_news`. Release migrations cannot
// backfill rows, so an upgraded deployment runs this once by hand:
//   node --env-file=.env scripts/rename-source-config-key.ts
// Re-runnable: batches of rows without the old key are skipped, and a row that already carries the new
// key only loses the old one.
import { closeDb, sql } from "@baoxian-news/backend/db";

const OLD_KEY = "_aihot";
const NEW_KEY = "_baoxian_news";
const BATCH = 200;

let renamed = 0;
for (;;) {
  const rows = await sql<{ id: string }[]>`
    UPDATE sources
    SET config = CASE
        WHEN config ? ${NEW_KEY} THEN config - ${OLD_KEY}
        ELSE jsonb_set(config - ${OLD_KEY}, ARRAY[${NEW_KEY}], config -> ${OLD_KEY})
      END
    WHERE id IN (SELECT id FROM sources WHERE config ? ${OLD_KEY} ORDER BY id LIMIT ${BATCH})
    RETURNING id
  `;
  renamed += rows.length;
  if (rows.length < BATCH) break;
}

console.log(`sources: ${renamed} config key(s) renamed`);
await closeDb();
