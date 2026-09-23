/**
 * Teste do motor do ranking (rode com `npm run test:ranking`). Cobre pontuação,
 * desempate do campeão e o prêmio em inteiros. R14/R15 reprovam a versão em float.
 */
import assert from "node:assert/strict";
import {
  prizeCents,
  rankSeason,
  tallyPoints,
  type RankableOrder,
  type RankableUser,
} from "./ranking.engine.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const d = (iso: string) => new Date(iso);
const ord = (userId: string, eventId: string, items: number, at = "2026-09-10T12:00:00Z"): RankableOrder => ({
  userId,
  eventId,
  createdAt: d(at),
  items,
});
const usersMap = (...list: [string, string][]) =>
  new Map<string, RankableUser>(list.map(([id, name]) => [id, { id, displayName: name, avatarUrl: null }]));

console.log("ranking.engine");

test("R1 sem pedidos → []", () => {
  assert.deepEqual(rankSeason([], new Map()), []);
});

test("R2 1 usuário, 2 rodadas, 3 itens → 35 pontos", () => {
  const r = rankSeason([ord("u1", "e1", 2), ord("u1", "e2", 1)], usersMap(["u1", "Ana"]));
  assert.equal(r[0].points, 35);
});

test("R3 2 pedidos no mesmo evento contam 1 rodada", () => {
  const r = rankSeason([ord("u1", "e1", 1), ord("u1", "e1", 1)], usersMap(["u1", "Ana"]));
  assert.equal(r[0].roundsParticipated, 1);
});

test("R4 participação de racha (items:0) vale 10 pontos", () => {
  const r = rankSeason([ord("u1", "e1", 0)], usersMap(["u1", "Ana"]));
  assert.equal(r[0].points, 10);
});

test("R5 usuário ausente do Map (desativado) some", () => {
  const r = rankSeason([ord("u1", "e1", 1)], new Map());
  assert.deepEqual(r, []);
});

test("R6 empate de pontos → posição densa (1,1,2)", () => {
  const r = rankSeason(
    [ord("u1", "e1", 0), ord("u1", "e2", 0), ord("u2", "e1", 0), ord("u2", "e2", 0), ord("u3", "e1", 0)],
    usersMap(["u1", "Ana"], ["u2", "Bruno"], ["u3", "Carla"]),
  );
  assert.deepEqual(r.map((e) => e.position), [1, 1, 2]);
});

test("R7 empate de pontos, mais rodadas vem primeiro", () => {
  const r = rankSeason(
    [ord("u1", "e1", 0), ord("u1", "e2", 0), ord("u2", "e1", 2)], // u1=20 (2 rodadas), u2=20 (1 rodada+2 itens)
    usersMap(["u1", "Ana"], ["u2", "Bruno"]),
  );
  assert.equal(r[0].id, "u1");
});

test("R8 empate de pontos e rodadas, firstOrderAt mais antigo vem primeiro", () => {
  const r = rankSeason(
    [ord("u1", "e1", 2, "2026-09-01T10:00:00Z"), ord("u2", "e2", 2, "2026-09-05T10:00:00Z")],
    usersMap(["u1", "Zeca"], ["u2", "Ana"]),
  );
  assert.equal(r[0].id, "u1"); // mais antigo, apesar do nome depois no alfabeto
});

test("R9 empate total → ordem alfabética pt-BR", () => {
  const r = rankSeason(
    [ord("u1", "e1", 2, "2026-09-01T10:00:00Z"), ord("u2", "e2", 2, "2026-09-01T10:00:00Z")],
    usersMap(["u1", "Bruno"], ["u2", "Ana"]),
  );
  assert.equal(r[0].displayName, "Ana");
});

test("R10 prizeCents(14300, 0.3) === 4290", () => assert.equal(prizeCents(14300, 0.3), 4290));
test("R11 prizeCents(101, 0.3) === 30 (floor)", () => assert.equal(prizeCents(101, 0.3), 30));
test("R12 prizeCents zero", () => {
  assert.equal(prizeCents(0, 0.3), 0);
  assert.equal(prizeCents(5000, 0), 0);
});
test("R13 prizeCents(-100, 0.3) === 0", () => assert.equal(prizeCents(-100, 0.3), 0));
test("R14 prizeCents(100, 0.29) === 29 (float daria 28)", () => assert.equal(prizeCents(100, 0.29), 29));
test("R15 prizeCents(180, 0.35) === 63 (float daria 62)", () => assert.equal(prizeCents(180, 0.35), 63));

test("R16 tallyPoints 1 rodada, 3 itens → {1,3,25}", () => {
  assert.deepEqual(tallyPoints([ord("u1", "e1", 1), ord("u1", "e1", 2)]), {
    roundsParticipated: 1,
    itemsAcquired: 3,
    points: 25,
  });
});

test("R17 tallyPoints([]) → {0,0,0}", () => {
  assert.deepEqual(tallyPoints([]), { roundsParticipated: 0, itemsAcquired: 0, points: 0 });
});

console.log(`\n${passed} casos do motor de ranking passaram. ✅`);
