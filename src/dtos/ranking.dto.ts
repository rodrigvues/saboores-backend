import type { RankingEntry } from "../services/ranking.service.js";

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
