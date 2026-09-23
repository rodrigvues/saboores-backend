import type { RankingEntry, RankingSnapshot } from "../services/ranking.service.js";
import { centsToReais } from "../utils/money.js";

/** Item público do ranking (F4.4): #, apelido, avatar, pontos. */
export type RankingItemDto = {
  position: number;
  id: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
};

export function toRankingItemDto(entry: RankingEntry): RankingItemDto {
  return {
    position: entry.position,
    id: entry.id,
    displayName: entry.displayName,
    avatarUrl: entry.avatarUrl,
    points: entry.points,
  };
}

export type RankingSeasonDto = {
  period: string;
  label: string;
  startsAt: string;
  endsAt: string;
  resetsAt: string;
  endsAtLabel: string;
};
export type RankingPrizeDto = { amount: string; windowDays: number };
export type RankingChampionDto = {
  period: string;
  label: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
};
export type RankingResponseDto = {
  season: RankingSeasonDto;
  prize: RankingPrizeDto;
  previousChampion: RankingChampionDto | null;
  entries: RankingItemDto[];
};

/** Envelope do GET /ranking. Nada de fração, e-mail ou centavos crus (RN-19). */
export function toRankingResponseDto(snapshot: RankingSnapshot): RankingResponseDto {
  return {
    season: {
      period: snapshot.season.period,
      label: snapshot.season.label,
      startsAt: snapshot.season.startsAt.toISOString(),
      endsAt: snapshot.season.endsAt.toISOString(),
      resetsAt: snapshot.season.resetsAt.toISOString(),
      endsAtLabel: snapshot.season.endsAtLabel,
    },
    prize: {
      amount: centsToReais(snapshot.prize.amountCents),
      windowDays: snapshot.prize.windowDays,
    },
    previousChampion: snapshot.previousChampion,
    entries: snapshot.entries.map(toRankingItemDto),
  };
}
