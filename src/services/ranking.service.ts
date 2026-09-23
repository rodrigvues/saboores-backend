import { Prisma } from "@prisma/client";
import { statsRepository } from "../repositories/stats.repository.js";
import { rankingSeasonRepository } from "../repositories/rankingSeason.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { env } from "../config/env.js";
import { decimalToCents } from "../utils/money.js";
import {
  monthWindow,
  previousMonthWindow,
  monthLabel,
  lastDayLabel,
  type MonthWindow,
} from "../utils/period.js";
import {
  prizeCents,
  rankSeason,
  tallyPoints,
  type RankableOrder,
  type RankableUser,
  type RankedEntry,
} from "./ranking.engine.js";

/** Janela do prêmio: 30 dias corridos (RN-16), de propósito diferente do mês. */
const PRIZE_WINDOW_DAYS = 30;
const CACHE_TTL_MS = 60_000;

export type RankingEntry = RankedEntry; // shape preservado para os DTOs

export type UserStatsAndRank = {
  roundsParticipated: number;
  itemsAcquired: number;
  points: number;
  rank: number | null;
  pointsAllTime: number;
  season: { period: string; label: string };
};

export type ChampionView = {
  period: string;
  label: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
};

export type RankingSnapshot = {
  season: {
    period: string;
    label: string;
    startsAt: Date;
    endsAt: Date;
    resetsAt: Date;
    endsAtLabel: string;
  };
  prize: { amountCents: number; windowDays: number };
  previousChampion: ChampionView | null;
  entries: RankingEntry[];
};

type Cached = {
  entries: RankingEntry[];
  byUser: Map<string, RankingEntry>;
  /** Só o getSnapshot() preenche (decisão 17): o perfil público não calcula prêmio. */
  snapshot: RankingSnapshot | null;
  expiresAt: number;
};

// Cache por período (RN-22): a virada do mês cria uma chave nova sozinha.
const cache = new Map<string, Cached>();

const toRankableOrder = (row: {
  userId: string;
  eventId: string;
  createdAt: Date;
  orderItems: { quantity: number }[];
}): RankableOrder => ({
  userId: row.userId,
  eventId: row.eventId,
  createdAt: row.createdAt,
  items: row.orderItems.reduce((sum, item) => sum + item.quantity, 0),
});

class RankingService {
  /** Limpa o cache (RN-23). */
  invalidate() {
    cache.clear();
  }

  /** Entrada do controller: temporada corrente, prêmio e campeão anterior. */
  async getSnapshot(): Promise<RankingSnapshot> {
    const window = monthWindow();
    const hit = cache.get(window.period);
    if (hit?.snapshot && hit.expiresAt > Date.now()) return hit.snapshot;

    const { entries, byUser } =
      hit && hit.expiresAt > Date.now()
        ? { entries: hit.entries, byUser: hit.byUser }
        : await this.computeSeason(window);

    const amountCents = await this.computePrizeCents();
    const previousChampion = await this.ensurePreviousSeasonClosed();

    const snapshot: RankingSnapshot = {
      season: {
        period: window.period,
        label: monthLabel(window.period),
        startsAt: window.start,
        endsAt: window.end,
        resetsAt: window.end,
        endsAtLabel: lastDayLabel(window),
      },
      prize: { amountCents, windowDays: PRIZE_WINDOW_DAYS },
      previousChampion,
      entries,
    };

    cache.clear();
    cache.set(window.period, { entries, byUser, snapshot, expiresAt: Date.now() + CACHE_TTL_MS });
    return snapshot;
  }

  /** Estatísticas do mês + posição + total histórico (decisão 17: sem prêmio). */
  async getUserStatsAndRank(userId: string): Promise<UserStatsAndRank> {
    const window = monthWindow();
    const hit = cache.get(window.period);

    const { entries, byUser } =
      hit && hit.expiresAt > Date.now()
        ? { entries: hit.entries, byUser: hit.byUser }
        : await this.computeSeason(window);

    if (!(hit && hit.expiresAt > Date.now())) {
      cache.clear();
      cache.set(window.period, {
        entries,
        byUser,
        snapshot: hit?.snapshot ?? null,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }

    // pointsAllTime (RN-14b): mesma fórmula, sem janela.
    const allRows = await statsRepository.validOrderRows({ userId });
    const pointsAllTime = tallyPoints(allRows.map(toRankableOrder)).points;

    const season = { period: window.period, label: monthLabel(window.period) };
    const entry = byUser.get(userId);
    if (!entry) {
      return { roundsParticipated: 0, itemsAcquired: 0, points: 0, rank: null, pointsAllTime, season };
    }
    return {
      roundsParticipated: entry.roundsParticipated,
      itemsAcquired: entry.itemsAcquired,
      points: entry.points,
      rank: entry.position,
      pointsAllTime,
      season,
    };
  }

  /** Idempotente por `period` (RN-10): quem perder a corrida relê a linha. */
  async closeSeason(window: MonthWindow) {
    const existing = await rankingSeasonRepository.findByPeriod(window.period);
    if (existing) return existing;

    // RN-11b: não congela mês que ainda pode receber confirmação de pagamento.
    const readyAt = window.end.getTime() + env.rankingSeasonGraceHours * 3_600_000;
    if (Date.now() < readyAt) return null;

    const { entries } = await this.computeSeason(window);
    const champion = entries[0] ?? null; // RN-8: a ordenação já decidiu

    try {
      return await rankingSeasonRepository.create({
        period: window.period,
        closedAt: new Date(),
        championUserId: champion?.id ?? null,
        championDisplayName: champion?.displayName ?? null,
        championAvatarUrl: champion?.avatarUrl ?? null,
        championPoints: champion?.points ?? 0,
        participants: entries.length,
        // RN-21: janela que TERMINA com a temporada, não a do instante do job.
        // RN-21b: falha no agregado grava null, mas não impede o fechamento.
        prizeAmountCents: await this.computePrizeCents(window.end).catch((error) => {
          console.error(`[ranking] prêmio indisponível no fechamento de ${window.period}`, error);
          return null;
        }),
      });
    } catch (error) {
      // Corrida entre o cron e a auto cura: a linha do outro vale.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return rankingSeasonRepository.findByPeriod(window.period);
      }
      throw error;
    }
  }

  /** Busca linhas, agrega e ordena. Sem prêmio e sem auto cura. */
  private async computeSeason(window: MonthWindow) {
    const rows = await statsRepository.validOrderRows({ from: window.start, to: window.end });
    const orders = rows.map(toRankableOrder);

    const userIds = [...new Set(orders.map((order) => order.userId))];
    const users = await userRepository.findManyForRanking(userIds);
    const userMap = new Map<string, RankableUser>();
    for (const user of users) {
      if (user.disabledAt) continue; // RN-4
      userMap.set(user.id, {
        id: user.id,
        displayName: user.displayName ?? `${user.name} ${user.surname}`,
        avatarUrl: user.avatarUrl,
      });
    }

    const entries = rankSeason(orders, userMap);
    return { entries, byUser: new Map(entries.map((entry) => [entry.id, entry])) };
  }

  private async computePrizeCents(reference: Date = new Date()): Promise<number> {
    const since = new Date(reference.getTime() - PRIZE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const sum = await statsRepository.sumServiceFeeForPrize({
      since,
      ownerEmail: env.rankingPrizeOwnerEmail,
    });
    // `_sum.serviceFee` é Prisma.Decimal | null; `.toString()` é a saída do repo.
    const profitCents = decimalToCents(sum?.toString() ?? null);
    return prizeCents(profitCents, env.rankingPrizeShare);
  }

  private async ensurePreviousSeasonClosed(): Promise<ChampionView | null> {
    try {
      const previous = previousMonthWindow();
      const season = await this.closeSeason(previous);
      // O snapshot é a verdade (RN-14): championUserId pode ser null por SET NULL.
      if (!season?.championDisplayName) return null;
      return {
        period: season.period,
        label: monthLabel(season.period),
        displayName: season.championDisplayName,
        avatarUrl: season.championAvatarUrl,
        points: season.championPoints,
      };
    } catch (error) {
      // RN-13: uma escrita que falha não pode derrubar a leitura da tela.
      console.error("[ranking] falha ao fechar a temporada anterior", error);
      return null;
    }
  }
}

export const rankingService = new RankingService();
