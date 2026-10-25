import assert from "node:assert/strict";
import { test } from "node:test";
import { beijingIso } from "@aihot/contracts/time";
import { dailyCheckAt, emptyChecksAfter, mpCheckDue, nextCheckAt } from "@aihot/backend/sources/mp";

// Beijing is UTC+8. The daily read runs at the site's daily collection time (COLLECT_TIMES.daily,
// 03:00 Beijing), so the anchor is 03:00 Beijing = 19:00 UTC the day before.
const anchor = (instant: string) => dailyCheckAt(new Date(instant));

test("the daily read runs at 03:00 Beijing on the reader's calendar day", () => {
  // 02:30 Beijing on the 23rd.
  assert.equal(beijingIso(anchor("2026-10-22T18:30:00Z")), "2026-10-23T03:00:00.000+08:00");
  // 23:00 Beijing on the 23rd: still the 23rd's anchor, not the 24th's.
  assert.equal(beijingIso(anchor("2026-10-23T15:00:00Z")), "2026-10-23T03:00:00.000+08:00");
});

test("an account never read is due at once", () => {
  const now = new Date("2026-10-23T00:30:00Z"); // 08:30 Beijing
  assert.equal(mpCheckDue(null, 1440, now), true);
});

test("a daily account read before today's anchor is due after it", () => {
  const now = new Date("2026-10-23T00:30:00Z"); // 08:30 Beijing
  // Last read yesterday 18:19 Beijing.
  assert.equal(mpCheckDue("2026-10-22T10:19:00.000Z", 1440, now), true);
  // Last read today 02:00 Beijing, an hour before the anchor.
  assert.equal(mpCheckDue("2026-10-22T18:00:00.000Z", 1440, now), true);
});

test("a daily account read after today's anchor waits for tomorrow", () => {
  const now = new Date("2026-10-23T00:30:00Z"); // 08:30 Beijing
  // Read today 03:05 Beijing.
  assert.equal(mpCheckDue("2026-10-22T19:05:00.000Z", 1440, now), false);
});

test("a daily account is not read before today's anchor, however long ago it was read", () => {
  const now = new Date("2026-10-22T18:00:00Z"); // 02:00 Beijing, an hour before the anchor
  assert.equal(mpCheckDue("2026-10-21T19:05:00.000Z", 1440, now), false);
});

test("a three-day account is read on the third daily instant after its last read", () => {
  // Read 06:00 Beijing on the 24th: that day's slot is 03:00, so the next read is 03:00 on the 27th.
  const last = "2026-10-23T22:00:00.000Z";
  assert.equal(beijingIso(nextCheckAt(new Date(last), 4320)), "2026-10-27T03:00:00.000+08:00");
  // 08:00 Beijing on the 26th: still waiting.
  assert.equal(mpCheckDue(last, 4320, new Date("2026-10-26T00:00:00Z")), false);
  // 03:30 Beijing on the 27th: due.
  assert.equal(mpCheckDue(last, 4320, new Date("2026-10-26T19:30:00Z")), true);
});

test("a three-day account read before the slot counts from the day before", () => {
  // Read 02:00 Beijing on the 24th, before that day's 03:00 slot: the 23rd's slot plus three days.
  const last = "2026-10-23T18:00:00.000Z";
  assert.equal(beijingIso(nextCheckAt(new Date(last), 4320)), "2026-10-26T03:00:00.000+08:00");
  assert.equal(mpCheckDue(last, 4320, new Date("2026-10-25T19:30:00Z")), true); // 03:30 Beijing on the 26th
});

test("a shorter interval still reads on its own clock", () => {
  const now = new Date("2026-10-23T03:00:00Z"); // 11:00 Beijing
  assert.equal(mpCheckDue("2026-10-22T22:00:00.000Z", 240, now), true); // 5 h ago
  assert.equal(mpCheckDue("2026-10-23T00:30:00.000Z", 240, now), false); // 2.5 h ago
});

test("a run of empty checks counts up, and one that finds posts clears it", () => {
  assert.equal(emptyChecksAfter(undefined, 0), 1);
  // A cursor read back from JSON carries the count as a number, or as text from an older write.
  assert.equal(emptyChecksAfter(3, 0), 4);
  assert.equal(emptyChecksAfter("2", 0), 3);
  assert.equal(emptyChecksAfter(9, 3), 0);
  assert.equal(emptyChecksAfter(9, 1), 0);
});
