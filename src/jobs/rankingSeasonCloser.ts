import cron, { type ScheduledTask } from "node-cron";
import { rankingService } from "../services/ranking.service.js";
import { previousMonthWindow, RANKING_TIMEZONE } from "../utils/period.js";
import { env } from "../config/env.js";

/**
 * Fecha a temporada que acabou de terminar (RN-11). A idempotência vem do
 * UNIQUE em `period`, não de um `if`: o cron e a auto cura podem correr juntos.
 */
export async function runRankingSeasonCloser() {
  const previous = previousMonthWindow();
  const season = await rankingService.closeSeason(previous);
  // `null` é recusa por carência (RN-11b), não erro — e não é "ninguém pontuou".
  if (!season) {
    console.info(`🏆 [jobs] temporada ${previous.period} ainda em carência, não fechada.`);
    return;
  }
  console.info(
    `🏆 [jobs] temporada ${previous.period} fechada (campeão: ${season.championDisplayName ?? "ninguém"}).`,
  );
}

let task: ScheduledTask | null = null;

export function startRankingSeasonCloser() {
  if (task) return;
  if (!cron.validate(env.rankingSeasonCron)) {
    console.error(
      `[jobs] RANKING_SEASON_CRON inválido ("${env.rankingSeasonCron}") — job não agendado.`,
    );
    return;
  }
  task = cron.schedule(
    env.rankingSeasonCron,
    () => {
      runRankingSeasonCloser().catch((error) =>
        console.error("[jobs] erro no rankingSeasonCloser", error),
      );
    },
    { timezone: RANKING_TIMEZONE },
  );
  console.info(
    `🏆 Job de fechamento de temporada agendado (${env.rankingSeasonCron}, ${RANKING_TIMEZONE}).`,
  );
}
