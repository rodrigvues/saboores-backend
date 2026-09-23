/**
 * Teste do utilitário de janela de mês (rode com `npm run test:period`).
 * A prova da decisão 3 (o fuso do servidor não entra na conta) é rodar este
 * mesmo arquivo com TZ=America/New_York e obter resultado idêntico (DoD).
 */
import assert from "node:assert/strict";
import {
  lastDayLabel,
  monthLabel,
  monthWindow,
  previousMonthWindow,
  windowOfPeriod,
} from "./period.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("period");

const dez = monthWindow(new Date("2027-01-01T02:30:00.000Z")); // 31/12/2026 23:30 SP

test("P1 pedido 31/12 23:30 SP cai em 2026-12", () => {
  assert.equal(dez.period, "2026-12");
});
test("P2 start = 2026-12-01T03:00Z", () => {
  assert.equal(dez.start.toISOString(), "2026-12-01T03:00:00.000Z");
});
test("P3 end = 2027-01-01T03:00Z", () => {
  assert.equal(dez.end.toISOString(), "2027-01-01T03:00:00.000Z");
});

const jan = monthWindow(new Date("2027-01-01T03:10:00.000Z")); // 01/01/2027 00:10 SP
test("P4 pedido 01/01 00:10 SP cai em 2027-01", () => {
  assert.equal(jan.period, "2027-01");
});
test("P5 start = 2027-01-01T03:00Z", () => {
  assert.equal(jan.start.toISOString(), "2027-01-01T03:00:00.000Z");
});
test("P6 previousMonthWindow → 2026-12", () => {
  assert.equal(previousMonthWindow(new Date("2027-01-01T03:10:00.000Z")).period, "2026-12");
});
test("P7 fronteira exata pertence ao mês novo", () => {
  const t = new Date("2027-01-01T03:00:00.000Z").getTime();
  assert.ok(t >= jan.start.getTime()); // >= start (inclusivo)
  assert.ok(t >= dez.end.getTime()); // >= end de dez (exclusivo): não é de dez
});

const set = monthWindow(new Date("2026-09-15T12:00:00.000Z"));
test("P8 setembro", () => {
  assert.equal(set.period, "2026-09");
  assert.equal(set.start.toISOString(), "2026-09-01T03:00:00.000Z");
});
test("P9 windowOfPeriod('2026-12') == P1", () => {
  const w = windowOfPeriod("2026-12");
  assert.equal(w.period, dez.period);
  assert.equal(w.start.toISOString(), dez.start.toISOString());
  assert.equal(w.end.toISOString(), dez.end.toISOString());
});
test("P10 monthLabel", () => {
  assert.equal(monthLabel("2026-09"), "Setembro/2026");
});
test("P11 lastDayLabel", () => {
  assert.equal(lastDayLabel(set), "30/09/2026");
});

console.log(`\n${passed} casos de período passaram. ✅`);
