/**
 * Motor puro do ranking (sem Prisma, sem I/O). A pontuação é a mesma de sempre;
 * o que mudou é o recorte temporal (mensal) e a regra de campeão com desempate.
 */

// F4.4 — pontuação (inalterada; só o recorte é que virou mensal).
export const POINTS_PER_ROUND = 10;
export const POINTS_PER_ITEM = 5;

export type RankableOrder = {
  userId: string;
  eventId: string;
  createdAt: Date;
  /** Soma das quantidades dos itens do pedido (0 nos rachas). */
  items: number;
};

export type RankableUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type RankedEntry = {
  position: number;
  id: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
  roundsParticipated: number;
  itemsAcquired: number;
  /** Primeiro pedido válido do usuário na temporada (desempate RN-7). */
  firstOrderAt: Date;
};

/** RN-5 — pontos de um conjunto de pedidos válidos. É a ÚNICA fórmula de pontuação
 *  do sistema: serve ao mês (dentro de `rankSeason`) e ao total histórico. */
export function tallyPoints(orders: RankableOrder[]): {
  roundsParticipated: number;
  itemsAcquired: number;
  points: number;
} {
  const rounds = new Set<string>();
  let itemsAcquired = 0;
  for (const order of orders) {
    rounds.add(order.eventId); // rodada distinta, não pedido
    itemsAcquired += order.items;
  }
  const roundsParticipated = rounds.size;
  return {
    roundsParticipated,
    itemsAcquired,
    points: roundsParticipated * POINTS_PER_ROUND + itemsAcquired * POINTS_PER_ITEM,
  };
}

/** Agrega, ordena (RN-7) e numera em posição densa (RN-6). */
export function rankSeason(
  orders: RankableOrder[],
  users: Map<string, RankableUser>,
): RankedEntry[] {
  const byUser = new Map<string, RankableOrder[]>();
  for (const order of orders) {
    const list = byUser.get(order.userId) ?? [];
    list.push(order);
    byUser.set(order.userId, list);
  }

  const ranked = [...byUser.entries()]
    .map(([userId, userOrders]) => {
      const user = users.get(userId);
      // Contas desativadas não entram no Map: descartadas antes da ordenação (RN-4).
      if (!user) return null;
      const tally = tallyPoints(userOrders);
      const firstOrderAt = userOrders.reduce(
        (min, o) => (o.createdAt < min ? o.createdAt : min),
        userOrders[0].createdAt,
      );
      return {
        id: userId,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        points: tally.points,
        roundsParticipated: tally.roundsParticipated,
        itemsAcquired: tally.itemsAcquired,
        firstOrderAt,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  ranked.sort(
    (a, b) =>
      b.points - a.points ||
      b.roundsParticipated - a.roundsParticipated ||
      a.firstOrderAt.getTime() - b.firstOrderAt.getTime() ||
      a.displayName.localeCompare(b.displayName, "pt-BR"),
  );

  // Posição densa: empates compartilham a posição e o seguinte vem logo após (RN-6).
  const entries: RankedEntry[] = [];
  let position = 0;
  let previousPoints: number | null = null;
  for (const entry of ranked) {
    if (previousPoints === null || entry.points !== previousPoints) {
      position += 1;
      previousPoints = entry.points;
    }
    entries.push({ position, ...entry });
  }
  return entries;
}

/** RN-17: em inteiros, arredonda para baixo e nunca devolve negativo. */
export function prizeCents(profitCents: number, share: number): number {
  if (!Number.isFinite(profitCents) || !Number.isFinite(share)) return 0;
  if (profitCents <= 0 || share <= 0) return 0;
  // Basis points inteiros: Math.floor(100 * 0.29) devolve 28, e o certo é 29.
  const bps = Math.round(share * 10_000);
  return Math.floor((profitCents * bps) / 10_000);
}
