/**
 * Teste ad-hoc do motor da taxa de serviço (rode com `npm run test:engine`).
 * Sem test runner: `node:assert`. A tabela de casos é a mesma do espelho no
 * frontend (src/utils/money.spec.ts): os dois lados têm de bater ao centavo.
 */
import assert from "node:assert/strict";
import {
  hasMoreThanTwoDecimals,
  serviceFeeCents,
} from "./serviceFee.engine.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("serviceFee.engine");

// [subtotalCents, percent, taxaEsperadaCents] — fonte única (plano 05 §9.1).
const TABELA: [number, number, number][] = [
  [1000, 10, 100],
  [1500, 10, 150],
  [5, 10, 1],
  [999, 7.5, 75],
  [333, 7.5, 25],
  [666, 7.5, 50],
  [2400, 12.5, 300],
  [1500, 8.7, 131],
  [2350, 7.5, 176],
  [1000, 0.01, 0],
  [2500, 100, 2500],
  [850, 10, 85],
  [0, 10, 0],
];

test("tabela de equivalência 9.1 (inclui 1500/8.7=131 e 5/10=1)", () => {
  for (const [subtotal, percent, esperado] of TABELA) {
    assert.equal(
      serviceFeeCents(subtotal, percent),
      esperado,
      `${subtotal} a ${percent}% deveria dar ${esperado}`,
    );
  }
});

test("percentual 0 → 0", () => assert.equal(serviceFeeCents(1000, 0), 0));
test("subtotal 0 → 0", () => assert.equal(serviceFeeCents(0, 10), 0));
test("subtotal negativo → 0", () => assert.equal(serviceFeeCents(-100, 10), 0));
test("NaN → 0", () => assert.equal(serviceFeeCents(1000, Number.NaN), 0));

test("monotonia: taxa nunca cai quando o subtotal cresce (10%, 0..5000)", () => {
  let anterior = 0;
  for (let subtotal = 0; subtotal <= 5000; subtotal += 1) {
    const atual = serviceFeeCents(subtotal, 10);
    assert.ok(atual >= anterior, `caiu em ${subtotal}`);
    anterior = atual;
  }
});

test("hasMoreThanTwoDecimals: aceita 2 casas, rejeita 3+", () => {
  for (const ok of [0.01, 0.07, 1.1, 4.6, 7.5, 8.7, 9.2, 16.4, 33.33, 99.99, 100]) {
    assert.equal(hasMoreThanTwoDecimals(ok), false, `${ok} tem 2 casas`);
  }
  for (const bad of [0.001, 0.005, 0.015, 2.345, 10.005]) {
    assert.equal(hasMoreThanTwoDecimals(bad), true, `${bad} tem 3+ casas`);
  }
});

test("guarda anti-regressão: 10.000 percentuais de 2 casas passam", () => {
  for (let i = 1; i <= 10000; i += 1) {
    const p = i / 100;
    assert.equal(hasMoreThanTwoDecimals(p), false, `${p} foi reprovado`);
  }
});

console.log(`\n${passed} testes do motor de taxa passaram. ✅`);
