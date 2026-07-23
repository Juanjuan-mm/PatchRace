import assert from "node:assert/strict";
import test from "node:test";

import { parseRetryAfter } from "../src/retry-after.ts";

const now = Date.parse("2026-07-23T00:00:00.000Z");

test("parses seconds and rounds fractional milliseconds up", () => {
  assert.equal(parseRetryAfter("3", now), 3_000);
  assert.equal(parseRetryAfter("0.0001", now), 1);
});

test("parses HTTP-date and clamps expired dates", () => {
  assert.equal(parseRetryAfter("Thu, 23 Jul 2026 00:00:05 GMT", now), 5_000);
  assert.equal(parseRetryAfter("Wed, 22 Jul 2026 23:59:55 GMT", now), 0);
});

test("rejects absent, blank, negative, and invalid values", () => {
  assert.equal(parseRetryAfter(null, now), null);
  assert.equal(parseRetryAfter(" ", now), null);
  assert.equal(parseRetryAfter("-1", now), null);
  assert.equal(parseRetryAfter("tomorrow-ish", now), null);
});
