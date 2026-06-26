import {
  toPreferenceQuestionDto,
  type PreferenceQuestionDto,
} from "../dtos/preferenceQuestion.dto.js";
import { preferenceQuestionRepository } from "../repositories/preferenceQuestion.repository.js";

class PreferenceQuestionService {
  /** Perguntas ativas para montar o formulário de participação (RP4). */
  async listActive(): Promise<PreferenceQuestionDto[]> {
    const questions = await preferenceQuestionRepository.findActive();
    return questions.map(toPreferenceQuestionDto);
  }
}

export const preferenceQuestionService = new PreferenceQuestionService();
