import type { Request, Response } from "express";
import { rankingService } from "../services/ranking.service.js";
import { toRankingResponseDto } from "../dtos/ranking.dto.js";

class RankingController {
  /** GET /ranking — temporada corrente, prêmio e campeão anterior. */
  async index(_req: Request, res: Response) {
    const snapshot = await rankingService.getSnapshot();
    return res.json(toRankingResponseDto(snapshot));
  }
}

export const rankingController = new RankingController();
