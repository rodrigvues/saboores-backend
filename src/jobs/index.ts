import { env } from "../config/env.js";
import { startRoundStartNotifier } from "./roundStartNotifier.js";
import { startRankingSeasonCloser } from "./rankingSeasonCloser.js";

/** Inicia os jobs in-process (cron). Desligável via `JOBS_ENABLED=false`. */
export function startJobs() {
  if (!env.jobsEnabled) {
    console.info("⏸️  Jobs desabilitados (JOBS_ENABLED=false).");
    return;
  }
  startRoundStartNotifier();
  startRankingSeasonCloser();
}
