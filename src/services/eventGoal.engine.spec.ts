/**
 * Teste do motor da meta de valor (rode com `npm run test:goal`). Sem test
 * runner: `node:assert`. Casos da seção 9.1 do plano.
 */
import assert from "node:assert/strict";
import {
  amountToCents,
  centsToAmount,
  goalPercent,
  isGoalReached,
  resolveCountsTowardGoal,
} from "./eventGoal.engine.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("eventGoal.engine");

test("1 amountToCents", () => {
  assert.equal(amountToCents(100), 10000);
  assert.equal(amountToCents(99.99), 9999);
  assert.equal(amountToCents(0.1), 10);
  assert.equal(amountToCents(100.99), 10099);
});

test("2 centsToAmount", () => {
  assert.equal(centsToAmount(10000), "100.00");
  assert.equal(centsToAmount(0), "0.00");
  assert.equal(centsToAmount(6250), "62.50");
});

test("3 goalPercent 62%", () => assert.equal(goalPercent(6200, 10000, false), 62));
test("4 goalPercent chão", () => assert.equal(goalPercent(6299, 10000, false), 62));
test("5 goalPercent 99 antes de bater", () => assert.equal(goalPercent(9999, 10000, false), 99));
test("6 goalPercent teto 100", () => assert.equal(goalPercent(12800, 10000, false), 100));
test("7 goalPercent reached força 100", () => assert.equal(goalPercent(3000, 10000, true), 100));
test("8 goalPercent alvo inválido", () => assert.equal(goalPercent(0, 0, false), 0));

test("9 isGoalReached", () => {
  assert.equal(isGoalReached(9999, 10000), false);
  assert.equal(isGoalReached(10000, 10000), true);
  assert.equal(isGoalReached(10001, 10000), true);
});
test("10 isGoalReached alvo 0", () => assert.equal(isGoalReached(100, 0), false));

test("11 resolveCountsTowardGoal sem meta", () =>
  assert.equal(resolveCountsTowardGoal({ hasGoal: false, alreadyReached: false, optOut: false }), false));
test("12 resolveCountsTowardGoal já atingida", () =>
  assert.equal(resolveCountsTowardGoal({ hasGoal: true, alreadyReached: true, optOut: false }), false));
test("13 resolveCountsTowardGoal opt-out", () =>
  assert.equal(resolveCountsTowardGoal({ hasGoal: true, alreadyReached: false, optOut: true }), false));
test("14 resolveCountsTowardGoal compõe", () =>
  assert.equal(resolveCountsTowardGoal({ hasGoal: true, alreadyReached: false, optOut: false }), true));

console.log(`\n${passed} casos do motor da meta passaram. ✅`);
