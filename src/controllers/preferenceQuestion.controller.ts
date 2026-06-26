import type { Request, Response } from "express";
import { preferenceQuestionService } from "../services/preferenceQuestion.service.js";

class PreferenceQuestionController {
  /** GET /preference-questions — perguntas ativas do formulário (RP4). */
  async index(_req: Request, res: Response) {
    const questions = await preferenceQuestionService.listActive();
    return res.json(questions);
  }
}

export const preferenceQuestionController = new PreferenceQuestionController();
