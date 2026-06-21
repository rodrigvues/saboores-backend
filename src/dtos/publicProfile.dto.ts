import type { UserStatsAndRank } from "../services/ranking.service.js";

type PublicProfileRecord = {
  id: string;
  name: string;
  surname: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  team: string | null;
};

/**
 * DTO público (F4.2). NUNCA inclui e-mail ou role (RN2). Apelido cai para o nome
 * real quando não definido (F4.1 RN2).
 */
export type PublicProfileDto = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  team: string | null;
  stats: {
    roundsParticipated: number;
    itemsAcquired: number;
    points: number;
  };
  rank: number | null;
};

export function toPublicProfileDto(
  user: PublicProfileRecord,
  statsAndRank: UserStatsAndRank,
): PublicProfileDto {
  return {
    id: user.id,
    displayName: user.displayName ?? `${user.name} ${user.surname}`,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    team: user.team,
    stats: {
      roundsParticipated: statsAndRank.roundsParticipated,
      itemsAcquired: statsAndRank.itemsAcquired,
      points: statsAndRank.points,
    },
    rank: statsAndRank.rank,
  };
}
