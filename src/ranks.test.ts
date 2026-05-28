import test from "node:test";
import assert from "node:assert/strict";
import { RANKS, resolveRankFromTotals } from "./ranks";

test("rank data includes exactly 12 configured ranks", () => {
  assert.equal(RANKS.length, 12);
  assert.equal(RANKS[0]?.name, "Dough Beginner");
  assert.equal(RANKS[11]?.name, "Cookie Overlord");
  assert.equal(RANKS[11]?.minGave, 11201);
  assert.equal(RANKS[11]?.minReceived, 20300);
});

test("exact threshold values qualify for rank 1", () => {
  const rank = resolveRankFromTotals(1, 2);
  assert.equal(rank?.id, 1);
  assert.equal(rank?.name, "Dough Beginner");
});

test("below threshold does not qualify for any rank", () => {
  const rank = resolveRankFromTotals(0, 1);
  assert.equal(rank, null);
});

test("returns highest rank user qualifies for using both metrics", () => {
  const rank = resolveRankFromTotals(30, 19);
  assert.equal(rank?.id, 2);
  assert.equal(rank?.name, "Batch Buddy");
});

test("rank 8 threshold is inclusive for both gave and received", () => {
  const rank = resolveRankFromTotals(651, 1150);
  assert.equal(rank?.id, 8);
  assert.equal(rank?.name, "Cookie Monster");
});

test("missing one received cookie keeps user at prior rank", () => {
  const rank = resolveRankFromTotals(651, 1149);
  assert.equal(rank?.id, 7);
  assert.equal(rank?.name, "Crumble Royalty");
});

test("rank updates when cookie counts increase across threshold", () => {
  const before = resolveRankFromTotals(650, 1149);
  const after = resolveRankFromTotals(651, 1150);
  assert.equal(before?.id, 7);
  assert.equal(after?.id, 8);
});
