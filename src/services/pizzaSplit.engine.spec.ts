/**
 * Teste ad-hoc do motor (rode com `npm run test:engine`). Sem test runner: usa
 * `node:assert`. Cobre os casos sensíveis — 0/1/N participantes, doces e resíduo
 * de centavos no rateio. Dinheiro é coisa séria; este arquivo é a rede.
 */
import assert from "node:assert/strict";
import { recommendPurchase, splitCostEqually } from "./pizzaSplit.engine.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("pizzaSplit.engine");

test("sem participantes → zera tudo, sem estimativa por pessoa", () => {
  const r = recommendPurchase({
    participants: 0,
    totalSlices: 0,
    slicesPerPizza: 8,
    avgLargePizzaPrice: 60,
    sweetVoters: 0,
    flavorVotes: [],
    preferences: [],
  });
  assert.equal(r.recommendedPizzas.total, 0);
  assert.equal(r.estimatedTotal, 0);
  assert.equal(r.estimatedPerPerson, null);
});

test("1 participante, 6 fatias, 8/pizza → 1 pizza, valor cheio", () => {
  const r = recommendPurchase({
    participants: 1,
    totalSlices: 6,
    slicesPerPizza: 8,
    avgLargePizzaPrice: 60,
    sweetVoters: 0,
    flavorVotes: [],
    preferences: [],
  });
  assert.equal(r.recommendedPizzas.total, 1);
  assert.equal(r.estimatedTotal, 60);
  assert.equal(r.estimatedPerPerson, 60);
});

test("N participantes: arredonda fatias pra cima e divide igual", () => {
  const r = recommendPurchase({
    participants: 4,
    totalSlices: 20, // ceil(20/8) = 3 pizzas
    slicesPerPizza: 8,
    avgLargePizzaPrice: 60,
    sweetVoters: 0,
    flavorVotes: [],
    preferences: [],
  });
  assert.equal(r.recommendedPizzas.total, 3);
  assert.equal(r.estimatedTotal, 180);
  assert.equal(r.estimatedPerPerson, 45);
});

test("doces: separa salgadas/doces e distribui sugestão por votos", () => {
  const r = recommendPurchase({
    participants: 4,
    totalSlices: 32, // 4 pizzas
    slicesPerPizza: 8,
    avgLargePizzaPrice: 50,
    sweetVoters: 2, // round(4 * 2/4) = 2 doces
    flavorVotes: [
      { flavorId: "a", name: "Calabresa", isSweet: false, votes: 3 },
      { flavorId: "b", name: "Mussarela", isSweet: false, votes: 1 },
      { flavorId: "c", name: "Chocolate", isSweet: true, votes: 2 },
    ],
    preferences: [{ key: "beverage", text: "Refri?", yes: 4, no: 0 }],
  });
  assert.equal(r.recommendedPizzas.total, 4);
  assert.equal(r.recommendedPizzas.sweet, 2);
  assert.equal(r.recommendedPizzas.savory, 2);
  const total = r.flavorVotes.reduce((acc, f) => acc + f.suggestedPizzas, 0);
  assert.equal(total, 4); // soma das sugestões fecha o total de pizzas
  const beverage = r.preferences.find((p) => p.key === "beverage");
  assert.equal(beverage?.suggestion, 1); // ceil(4/4)
});

test("rateio: resíduo de centavos vai pro organizador e fecha o total", () => {
  const split = splitCostEqually({
    totalCostCents: 10000, // R$100,00
    participants: [
      { orderId: "o1", userId: "org" },
      { orderId: "o2", userId: "u2" },
      { orderId: "o3", userId: "u3" },
    ],
    organizerUserId: "org",
  });
  const sum = split.reduce((acc, s) => acc + s.amountDueCents, 0);
  assert.equal(sum, 10000); // fecha exatamente
  const org = split.find((s) => s.orderId === "o1");
  assert.equal(org?.amountDueCents, 3334); // 3333 + resíduo 1
  assert.equal(split.find((s) => s.orderId === "o2")?.amountDueCents, 3333);
});

test("rateio: organizador ausente → resíduo no primeiro", () => {
  const split = splitCostEqually({
    totalCostCents: 1000, // R$10,00 / 3 = 333 + resto 1
    participants: [
      { orderId: "o1", userId: "u1" },
      { orderId: "o2", userId: "u2" },
      { orderId: "o3", userId: "u3" },
    ],
    organizerUserId: "ausente",
  });
  assert.equal(split[0].amountDueCents, 334);
  assert.equal(split[0].amountDueCents + split[1].amountDueCents + split[2].amountDueCents, 1000);
});

console.log(`\n${passed} testes do motor passaram. ✅`);
