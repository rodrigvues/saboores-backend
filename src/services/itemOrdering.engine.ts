import { MOST_ORDERED_HIGHLIGHT_COUNT } from "../constants/order.js";

/**
 * Ordem do catálogo na tela de pedido (encomenda). Puro: recebe os itens e o
 * histórico do usuário, devolve a lista já na ordem final.
 */
export type OrderableItem = {
  id: string;
  name: string;
  /** Agregado derivado: unidades que o grupo inteiro já pediu. */
  orderCount: number;
};

export type OrderedItem<T> = {
  item: T;
  orderedByMe: boolean;
  isMostOrdered: boolean;
};

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, "pt-BR");
}

function byPopularity(a: OrderableItem, b: OrderableItem) {
  return b.orderCount - a.orderCount || byName(a, b);
}

/**
 * Ids dos campeões de pedido (RN-13). Ordena uma cópia para não depender da
 * ordem em que a lista chegou, e ignora quem nunca foi pedido.
 */
export function pickMostOrderedIds<T extends OrderableItem>(
  items: T[],
  limit: number = MOST_ORDERED_HIGHLIGHT_COUNT,
): Set<string> {
  return new Set(
    [...items]
      .filter((item) => item.orderCount > 0)
      .sort(byPopularity)
      .slice(0, limit)
      .map((item) => item.id),
  );
}

export function sortItemsByUserHistory<T extends OrderableItem>(
  items: T[],
  userQuantities: Map<string, number>,
): OrderedItem<T>[] {
  const mine: T[] = [];
  const others: T[] = [];
  // Destaque é global: vale em qualquer um dos dois grupos (RN-13).
  const mostOrdered = pickMostOrderedIds(items);

  for (const item of items) {
    if ((userQuantities.get(item.id) ?? 0) > 0) mine.push(item);
    else others.push(item);
  }

  mine.sort(
    (a, b) =>
      (userQuantities.get(b.id) ?? 0) - (userQuantities.get(a.id) ?? 0) || byName(a, b),
  );
  others.sort(byPopularity);

  const decorate = (item: T, orderedByMe: boolean): OrderedItem<T> => ({
    item,
    orderedByMe,
    isMostOrdered: mostOrdered.has(item.id),
  });

  return [
    ...mine.map((item) => decorate(item, true)),
    ...others.map((item) => decorate(item, false)),
  ];
}
