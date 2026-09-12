import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BACKFILL_EARLIEST_LOCAL,
  parseDatetimeLocal,
  toDatetimeLocalValue,
  validateBackfillSoldAt,
} from "./sales-backfill.js";

test("parseDatetimeLocal reads local wall time", () => {
  const d = parseDatetimeLocal("2026-07-22T15:30");
  assert.ok(d);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 22);
  assert.equal(d.getHours(), 15);
  assert.equal(d.getMinutes(), 30);
  assert.equal(parseDatetimeLocal("not-a-date"), null);
});

test("toDatetimeLocalValue round-trips with parseDatetimeLocal", () => {
  const source = new Date(2026, 7, 5, 9, 5);
  const parsed = parseDatetimeLocal(toDatetimeLocalValue(source));
  assert.equal(parsed.getTime(), source.getTime());
});

test("validateBackfillSoldAt enforces 22 Jul 2026 through now", () => {
  const tooEarly = new Date(2026, 6, 21, 23, 59);
  assert.equal(validateBackfillSoldAt(tooEarly).ok, false);

  const earliest = new Date(BACKFILL_EARLIEST_LOCAL);
  assert.equal(validateBackfillSoldAt(earliest).ok, true);

  const future = new Date(Date.now() + 60 * 60 * 1000);
  assert.equal(validateBackfillSoldAt(future).ok, false);

  assert.equal(validateBackfillSoldAt(new Date()).ok, true);
  assert.equal(validateBackfillSoldAt(null).ok, false);
});
