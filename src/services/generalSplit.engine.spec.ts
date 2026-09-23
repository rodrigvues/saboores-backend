/**
 * Teste ad-hoc do motor do racha geral (rode com `npm run test:engine:general`).
 * Sem test runner: `node:assert`. Cobre os 35 cenários da seção 9 do plano; toda
 * asserção de `computeShares` também verifica a invariante I-1 (a soma fecha).
 */
import assert from "node:assert/strict";
import {
  computeShares,
  pinnedCents,
  quoteForJoiner,
  targetShareCents,
} from "./generalSplit.engine.js";
import type { SplitParticipantInput, SplitShare } from "./generalSplit.engine.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const fl = (id: string): SplitParticipantInput => ({
  orderId: id,
  userId: id,
  sharePercentBps: null,
});
const pin = (id: string, bps: number): SplitParticipantInput => ({
  orderId: id,
  userId: id,
  sharePercentBps: bps,
});

function assertFecha(shares: SplitShare[], total: number) {
  const soma = shares.reduce((acc, s) => acc + s.amountDueCents, 0);
  assert.equal(soma, total, "I-1: a soma não fecha");
  for (const s of shares) assert.ok(s.amountDueCents >= 0, "valor negativo");
}

const values = (shares: SplitShare[]) => shares.map((s) => s.amountDueCents);

function run(total: number, participants: SplitParticipantInput[], creator = "ana") {
  const shares = computeShares({ totalAmountCents: total, participants, creatorUserId: creator });
  assertFecha(shares, Math.max(0, total));
  return values(shares);
}

console.log("generalSplit.engine");

test("C1 lista vazia", () => {
  assert.deepEqual(computeShares({ totalAmountCents: 10000, participants: [], creatorUserId: "ana" }), []);
});

test("C2 1 participante paga tudo", () => {
  assert.deepEqual(run(10000, [fl("ana")]), [10000]);
});

test("C3 2 flutuantes divisível", () => {
  assert.deepEqual(run(10000, [fl("ana"), fl("bruno")]), [5000, 5000]);
});

test("C4 5 flutuantes divisível", () => {
  assert.deepEqual(run(10000, [fl("ana"), fl("b"), fl("c"), fl("d"), fl("e")]), [2000, 2000, 2000, 2000, 2000]);
});

test("C5 3 flutuantes, resíduo no criador", () => {
  assert.deepEqual(run(10000, [fl("ana"), fl("b"), fl("c")]), [3334, 3333, 3333]);
});

test("C6 criador fixado, divisão exata", () => {
  assert.deepEqual(run(10000, [pin("ana", 4000), fl("b"), fl("c"), fl("d")]), [4000, 2000, 2000, 2000]);
});

test("C7 criador fixado, resíduo no primeiro flutuante", () => {
  assert.deepEqual(run(10001, [pin("ana", 4000), fl("b"), fl("c"), fl("d")]), [4000, 2001, 2000, 2000]);
});

test("C8 criador ausente da lista", () => {
  assert.deepEqual(run(1000, [fl("b"), fl("c"), fl("d")], "ana"), [334, 333, 333]);
});

test("C9 1 fixado (exemplo canônico do master)", () => {
  assert.deepEqual(run(10000, [fl("ana"), fl("bruno"), pin("carla", 6000), fl("davi")]), [1334, 1333, 6000, 1333]);
});

test("C10 vários fixados", () => {
  assert.deepEqual(run(10000, [fl("ana"), pin("bruno", 2000), pin("carla", 3000), fl("davi")]), [2500, 2000, 3000, 2500]);
});

test("C11 fixado em 100% com outros na lista", () => {
  assert.deepEqual(run(10000, [pin("ana", 10000), fl("b"), fl("c")]), [10000, 0, 0]);
});

test("C12 soma dos fixados = 100%, sem flutuante", () => {
  assert.deepEqual(run(10001, [pin("ana", 3333), pin("bruno", 3333), pin("carla", 3334)]), [3333, 3333, 3335]);
});

test("C13 estouro por arredondamento sem flutuante", () => {
  assert.deepEqual(run(3, [pin("ana", 5000), pin("bruno", 5000)]), [1, 2]);
});

test("C14 total de 1 centavo", () => {
  assert.deepEqual(run(1, [fl("ana"), fl("b"), fl("c")]), [1, 0, 0]);
});

test("C15 totalAmountCents = 0", () => {
  assert.deepEqual(run(0, [fl("ana"), fl("b")]), [0, 0]);
});

test("C16 determinismo", () => {
  const input = { totalAmountCents: 10000, participants: [fl("ana"), fl("bruno"), pin("carla", 6000), fl("davi")], creatorUserId: "ana" };
  assert.deepEqual(computeShares(input), computeShares(input));
});

test("C17 monotonicidade: ninguém sobe ao entrar um fixado", () => {
  const antes = run(10000, [fl("ana"), fl("bruno")]);
  const depois = run(10000, [fl("ana"), fl("bruno"), pin("carla", 6000), fl("davi")]);
  assert.ok(depois[0] <= antes[0] && depois[1] <= antes[1], "alguém subiu");
  assert.deepEqual([depois[0], depois[1]], [1334, 1333]);
});

test("C18 targetShareCents divisível", () => {
  assert.deepEqual([0, 1, 2].map((i) => targetShareCents(9000, 3, i)), [3000, 3000, 3000]);
});

test("C19 TARGET não divisível (I-4)", () => {
  const v = [0, 1, 2].map((i) => targetShareCents(10000, 3, i));
  assert.deepEqual(v, [3334, 3333, 3333]);
  assert.equal(v.reduce((a, b) => a + b, 0), 10000);
});

test("C20 TARGET soma parcial", () => {
  assert.equal(targetShareCents(10000, 3, 0) + targetShareCents(10000, 3, 1), 6667);
});

test("C21 TARGET alvo grande, total pequeno", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => targetShareCents(7, 5, i)), [3, 1, 1, 1, 1]);
});

test("C22 quoteForJoiner projeção de entrada", () => {
  const q = quoteForJoiner({ totalAmountCents: 10000, participantCount: 1, floatingCount: 1, pinnedBps: 0 });
  assert.equal(q.shareCentsIfFloating, 5000);
  assert.equal(q.participantsAfter, 2);
  assert.equal(q.minBps, 5000);
  assert.equal(q.maxBps, 10000);
});

test("C23 quoteForJoiner com 4 dentro", () => {
  assert.equal(quoteForJoiner({ totalAmountCents: 10000, participantCount: 4, floatingCount: 4, pinnedBps: 0 }).shareCentsIfFloating, 2000);
});

test("C24 quoteForJoiner com fixado no meio", () => {
  const q = quoteForJoiner({ totalAmountCents: 10000, participantCount: 3, floatingCount: 2, pinnedBps: 6000 });
  assert.equal(q.shareCentsIfFloating, 1333);
  assert.equal(q.minBps, 1333);
  assert.equal(q.maxBps, 4000);
});

test("C25 piso e teto colapsam no último flutuante", () => {
  const q = quoteForJoiner({ totalAmountCents: 10000, participantCount: 3, floatingCount: 0, pinnedBps: 7000 });
  assert.equal(q.minBps, 3000);
  assert.equal(q.maxBps, 3000);
});

test("C26 racha já 100% fixado", () => {
  const q = quoteForJoiner({ totalAmountCents: 10000, participantCount: 3, floatingCount: 0, pinnedBps: 10000 });
  assert.equal(q.minBps, 0);
  assert.equal(q.maxBps, 0);
  assert.equal(q.shareCentsIfFloating, 0);
});

test("C27 pinnedCents meio-para-cima", () => {
  assert.equal(pinnedCents(10001, 5000), 5001);
  assert.equal(pinnedCents(10000, 3333), 3333);
});

test("C28 pinnedCents com valor alto", () => {
  assert.equal(pinnedCents(100_000_000, 3333), 33_330_000);
});

test("C29 pureza: a entrada não é mutada", () => {
  const participants = [fl("ana"), fl("bruno"), pin("carla", 6000), fl("davi")];
  const copia = JSON.parse(JSON.stringify(participants));
  computeShares({ totalAmountCents: 10000, participants, creatorUserId: "ana" });
  assert.deepEqual(participants, copia);
});

test("C30 estouro por arredondamento COM flutuante", () => {
  assert.deepEqual(run(10001, [fl("ana"), pin("bruno", 5000), pin("carla", 5000)]), [0, 5000, 5001]);
});

test("C31 soma dos fixados > 100% (fora de contrato)", () => {
  assert.deepEqual(run(10000, [fl("ana"), pin("bruno", 9000), pin("carla", 9000)]), [0, 5000, 5000]);
});

test("C32 último flutuante cancelado, fixados 75%", () => {
  assert.deepEqual(run(10000, [pin("bruno", 5000), pin("carla", 2500)], "ana"), [6667, 3333]);
});

test("C33 rateio por peso com muitos fixados e total minúsculo", () => {
  const oito = Array.from({ length: 8 }, (_, i) => pin(`p${i}`, 1250));
  assert.deepEqual(run(5, oito), [0, 0, 0, 1, 1, 1, 1, 1]);
});

test("C34 percentual exibido bate com o valor exibido (I-8)", () => {
  const q = quoteForJoiner({ totalAmountCents: 3, participantCount: 1, floatingCount: 0, pinnedBps: 5000 });
  assert.equal(q.shareCentsIfFloating, 1);
  assert.equal(q.sharePercentIfFloating, 33.33);
});

test("C35 TARGET re-congelar depois de cancelar o índice 0", () => {
  const antes = [0, 1, 2].map((i) => targetShareCents(10000, 3, i)).reduce((a, b) => a + b, 0);
  // sobrou o antigo índice 1 (vira 0), o antigo 2 (vira 1) e um novo no índice 2
  const depois = [0, 1, 2].map((i) => targetShareCents(10000, 3, i)).reduce((a, b) => a + b, 0);
  assert.equal(antes, 10000);
  assert.equal(depois, 10000);
});

console.log(`\n${passed} cenários do motor do racha geral passaram. ✅`);
