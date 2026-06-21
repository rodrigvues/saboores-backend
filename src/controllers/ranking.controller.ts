import type { Request, Response } from "express";
import { rankingService } from "../services/ranking.service.js";
import { toRankingItemDto } from "../dtos/ranking.dto.js";

class RankingController {
  /** GET /ranking — ranking geral (F4.4). */
  async index(_req: Request, res: Response) {
    const ranking = await rankingService.getRanking();
    return res.json(ranking.map(toRankingItemDto));
  }
}

export const rankingController = new RankingController();
