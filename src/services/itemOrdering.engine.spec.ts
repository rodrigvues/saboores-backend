/**
 * Teste ad-hoc do motor de ordenação da vitrine (rode com `npm run test:ordering`).
 * Sem test runner: usa `node:assert`. Cobre os três níveis de ordem, o selo
 * "mais pedidos" e a insensibilidade à ordem de chegada.
 */
import assert from "node:assert/strict";
import {
  pickMostOrderedIds,
  sortItemsByUserHistory,
  type OrderableItem,
} from "./itemOrdering.engine.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const item = (id: string, name: string, orderCount: number): OrderableItem => ({
  id,
  name,
  orderCount,
});

const ids = (items: { item: OrderableItem }[]) => items.map((o) => o.item.id);

console.log("itemOrdering.engine");

test("1) lista vazia → []", () => {
  assert.deepEqual(sortItemsByUserHistory([], new Map()), []);
});

test("2) tudo em 0 e sem histórico → ordem alfabética, orderedByMe falso", () => {
  const items = [item("c", "Carne", 0), item("a", "Banana", 0), item("b", "Açaí", 0)];
  const result = sortItemsByUserHistory(items, new Map());
  assert.deepEqual(
    result.map((o) => o.item.name),
    ["Açaí", "Banana", "Carne"],
  );
  assert.ok(result.every((o) => o.orderedByMe === false));
});

test("3) histórico em dois itens → topo por quantidade do usuário desc", () => {
  const items = [item("a", "Carne", 5), item("b", "Queijo", 500), item("c", "Frango", 0)];
  const result = sortItemsByUserHistory(items, new Map([["a", 3], ["b", 10]]));
  assert.deepEqual(ids(result), ["b", "a", "c"]);
  assert.deepEqual([result[0].orderedByMe, result[1].orderedByMe, result[2].orderedByMe], [true, true, false]);
});

test("4) empate de quantidade do usuário → desempate por nome asc", () => {
  const items = [item("a", "Queijo", 0), item("b", "Carne", 0)];
  const result = sortItemsByUserHistory(items, new Map([["a", 2], ["b", 2]]));
  assert.deepEqual(ids(result), ["b", "a"]); // Carne antes de Queijo
});

test("5) sem histórico, orderCount diferente → orderCount desc", () => {
  const items = [item("a", "Carne", 3), item("b", "Queijo", 30), item("c", "Frango", 10)];
  const result = sortItemsByUserHistory(items, new Map());
  assert.deepEqual(ids(result), ["b", "c", "a"]);
});

test("6) empate de orderCount → desempate por nome asc", () => {
  const items = [item("a", "Queijo", 7), item("b", "Carne", 7)];
  const result = sortItemsByUserHistory(items, new Map());
  assert.deepEqual(ids(result), ["b", "a"]);
});

test("7) histórico com orderCount 0 vence orderCount 500 sem histórico", () => {
  const items = [item("a", "Carne", 0), item("b", "Queijo", 500)];
  const result = sortItemsByUserHistory(items, new Map([["a", 1]]));
  assert.deepEqual(ids(result), ["a", "b"]);
  assert.equal(result[0].orderedByMe, true);
});

test("8) quantidade 0 explícita no mapa → sem histórico (grupo 2)", () => {
  const items = [item("a", "Carne", 5), item("b", "Queijo", 9)];
  const result = sortItemsByUserHistory(items, new Map([["a", 0]]));
  assert.deepEqual(ids(result), ["b", "a"]); // ordem global, ninguém no grupo 1
  assert.ok(result.every((o) => o.orderedByMe === false));
});

test("9) acentuação pt-BR: Abacaxi antes de Açaí", () => {
  const items = [item("a", "Açaí", 0), item("b", "Abacaxi", 0)];
  const result = sortItemsByUserHistory(items, new Map());
  assert.deepEqual(
    result.map((o) => o.item.name),
    ["Abacaxi", "Açaí"],
  );
});

test("10) pickMostOrderedIds(310,142,87,0) → só os dois primeiros", () => {
  const items = [
    item("a", "Queijo", 310),
    item("b", "Carne", 142),
    item("c", "Pizza", 87),
    item("d", "Banana", 0),
  ];
  const set = pickMostOrderedIds(items);
  assert.equal(set.size, 2);
  assert.ok(set.has("a") && set.has("b"));
});

test("11) pickMostOrderedIds com tudo em 0 → conjunto vazio", () => {
  const items = [item("a", "Carne", 0), item("b", "Queijo", 0)];
  assert.equal(pickMostOrderedIds(items).size, 0);
});

test("12) pickMostOrderedIds com um único item pedido → um id só", () => {
  const items = [item("a", "Carne", 4), item("b", "Queijo", 0)];
  const set = pickMostOrderedIds(items);
  assert.equal(set.size, 1);
  assert.ok(set.has("a"));
});

test("13) empate na fronteira 300,200,200 → entra o 300 e o de nome menor", () => {
  const items = [
    item("x", "Xis", 300),
    item("c", "Carne", 200),
    item("b", "Banana", 200),
  ];
  const set = pickMostOrderedIds(items);
  assert.equal(set.size, 2);
  assert.ok(set.has("x") && set.has("b"));
  assert.ok(!set.has("c"));
});

test("14) entrada embaralhada → resultado idêntico ao da lista ordenada", () => {
  const base = [
    item("a", "Carne", 142),
    item("b", "Queijo", 310),
    item("c", "Pizza", 87),
    item("d", "Banana", 0),
  ];
  const quantities = new Map([["a", 5]]);
  const ordered = sortItemsByUserHistory(base, quantities);
  const shuffled = sortItemsByUserHistory([base[3], base[1], base[0], base[2]], quantities);
  assert.deepEqual(ids(shuffled), ids(ordered));
});

test("15) campeão que o usuário já pediu → grupo 1 e isMostOrdered", () => {
  const items = [
    item("a", "Queijo", 310),
    item("b", "Carne", 142),
    item("c", "Pizza", 5),
  ];
  const result = sortItemsByUserHistory(items, new Map([["a", 8]]));
  assert.equal(result[0].item.id, "a");
  assert.equal(result[0].orderedByMe, true);
  assert.equal(result[0].isMostOrdered, true);
});

console.log(`\n${passed} testes do motor de ordenação passaram. ✅`);
