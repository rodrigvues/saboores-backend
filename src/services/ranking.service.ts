import { statsRepository } from "../repositories/stats.repository.js";
import { userRepository } from "../repositories/user.repository.js";

// F4.4 RN1 — pontuação.
const POINTS_PER_ROUND = 10;
const POINTS_PER_ITEM = 5;
// Cache curto (cross-cutting F4: performance). Invalidado ao confirmar pagamento.
const CACHE_TTL_MS = 60_000;

export type RankingEntry = {
  position: number;
  id: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
  roundsParticipated: number;
  itemsAcquired: number;
};

export type UserStatsAndRank = {
  roundsParticipated: number;
  itemsAcquired: number;
  points: number;
  rank: number | null;
};

type Computed = {
  entries: RankingEntry[];
  byUser: Map<string, RankingEntry>;
  expiresAt: number;
};

let cache: Computed | null = null;

class RankingService {
  /** Limpa o cache (chamar quando um pedido é confirmado). */
  invalidate() {
    cache = null;
  }

  /** F4.4 — ranking ordenado (posição, apelido, pontos). */
  async getRanking(): Promise<RankingEntry[]> {
    const { entries } = await this.getComputed();
    return entries;
  }

  /** F4.3 — estatísticas + posição de um usuário (zeros se sem pedidos válidos). */
  async getUserStatsAndRank(userId: string): Promise<UserStatsAndRank> {
    const { byUser } = await this.getComputed();
    const entry = byUser.get(userId);
    if (!entry) {
      return { roundsParticipated: 0, itemsAcquired: 0, points: 0, rank: null };
    }
    return {
      roundsParticipated: entry.roundsParticipated,
      itemsAcquired: entry.itemsAcquired,
      points: entry.points,
      rank: entry.position,
    };
  }

  private async getComputed(): Promise<Computed> {
    if (cache && cache.expiresAt > Date.now()) {
      return cache;
    }

    const rows = await statsRepository.confirmedOrderRows();

    // Agrega por usuário: rodadas = eventos distintos; itens = soma de quantidade.
    const agg = new Map<string, { rounds: Set<string>; items: number }>();
    for (const row of rows) {
      const current = agg.get(row.userId) ?? { rounds: new Set<string>(), items: 0 };
      current.rounds.add(row.eventId);
      for (const item of row.orderItems) {
        current.items += item.quantity;
      }
      agg.set(row.userId, current);
    }

    const userIds = [...agg.keys()];
    const users = await userRepository.findManyForRanking(userIds);
    const userById = new Map(users.map((u) => [u.id, u]));

    const ranked = userIds
      .map((id) => {
        const user = userById.get(id);
        // Contas desativadas não aparecem no ranking.
        if (!user || user.disabledAt) return null;
        const a = agg.get(id)!;
        const roundsParticipated = a.rounds.size;
        const itemsAcquired = a.items;
        return {
          id,
          displayName: user.displayName ?? `${user.name} ${user.surname}`,
          avatarUrl: user.avatarUrl,
          roundsParticipated,
          itemsAcquired,
          points: roundsParticipated * POINTS_PER_ROUND + itemsAcquired * POINTS_PER_ITEM,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // Mais pontos primeiro; empate sem critério → ordem alfabética (ET F4.4).
    ranked.sort(
      (a, b) =>
        b.points - a.points || a.displayName.localeCompare(b.displayName, "pt-BR"),
    );

    // Posição de competição: empates compartilham a posição (1,1,3,...) — RN3.
    const entries: RankingEntry[] = [];
    let position = 0;
    let previousPoints: number | null = null;
    ranked.forEach((entry, index) => {
      if (previousPoints === null || entry.points !== previousPoints) {
        position = index + 1;
        previousPoints = entry.points;
      }
      entries.push({ position, ...entry });
    });

    cache = {
      entries,
      byUser: new Map(entries.map((e) => [e.id, e])),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    return cache;
  }
}

export const rankingService = new RankingService();
