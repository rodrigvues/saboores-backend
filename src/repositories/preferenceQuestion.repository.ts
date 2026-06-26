import { prisma } from "../lib/prisma.js";

class PreferenceQuestionRepository {
  /** Perguntas ativas do formulário (ordem de criação). */
  async findActive() {
    return prisma.preferenceQuestion.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, key: true, text: true },
    });
  }

  /** Subconjunto ativo por ids — valida as respostas recebidas num pedido. */
  async findActiveByIds(ids: string[]) {
    return prisma.preferenceQuestion.findMany({
      where: { id: { in: ids }, active: true },
      select: { id: true, key: true },
    });
  }
}

export const preferenceQuestionRepository = new PreferenceQuestionRepository();
