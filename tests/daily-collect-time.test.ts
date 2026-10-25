// The day has two instants on the site's clock: collection at COLLECT_TIMES.daily and analysis at
// ANALYSIS_TIME. A daily source lands on the next collection instant rather than "one interval after
// its last read" (which walks later every day by the length of a run), and the articles collection
// brings in wait for the analysis instant instead of paying for a scattered call each.
import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyCollectAt } from "@aihot/backend/sources/collect";
import { analysisStartAfter } from "@aihot/backend/jobs/content";

test("a daily source waits for the daily collection instant, not a day after its last read", () => {
  const at = (iso: string) => dailyCollectAt(new Date(iso)).toISOString();
  assert.equal(at("2026-10-24T02:31:00+08:00"), "2026-10-23T19:00:00.000Z", "before it has passed: today's");
  assert.equal(at("2026-10-24T03:00:00+08:00"), "2026-10-24T19:00:00.000Z", "from it on: tomorrow's");
  assert.equal(at("2026-10-24T16:58:00+08:00"), "2026-10-24T19:00:00.000Z", "an afternoon read lands on the next morning");
});

test("analysis waits for the analysis instant, then goes out at once", () => {
  const at = (iso: string) => analysisStartAfter(new Date(iso))?.toISOString() ?? null;
  assert.equal(at("2026-10-24T03:30:00+08:00"), "2026-10-23T21:00:00.000Z", "collected at 03:00, analysed at 05:00");
  assert.equal(at("2026-10-24T05:00:00+08:00"), null, "from it on, at once");
  assert.equal(at("2026-10-24T16:58:00+08:00"), null, "a retry in the afternoon runs now");
});
