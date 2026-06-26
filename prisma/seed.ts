import { PrismaClient } from "@prisma/client";

/**
 * Seed idempotente do Racha de Pizza: sabores padrão globais (`eventId = null`)
 * e perguntas sim/não do formulário de preferências. Rode com `npm run prisma:seed`
 * (ou `npx prisma db seed`). Reexecutar é seguro — atualiza/garante os registros.
 *
 * Ajuste as listas abaixo à vontade: elas são o catálogo padrão do sistema.
 */
const prisma = new PrismaClient();

/** Sabores padrão (globais). Doces marcados com `isSweet`. */
const GLOBAL_FLAVORS: { name: string; isSweet?: boolean }[] = [
  { name: "Calabresa" },
  { name: "Mussarela" },
  { name: "Portuguesa" },
  { name: "Frango com Catupiry" },
  { name: "Margherita" },
  { name: "Quatro Queijos" },
  { name: "Pepperoni" },
  { name: "Bacon" },
  { name: "Vegetariana" },
  // Doces
  { name: "Chocolate", isSweet: true },
  { name: "Banana com Canela", isSweet: true },
  { name: "Romeu e Julieta", isSweet: true },
];

/** Perguntas sim/não. A `key` dá a semântica usada pelo motor no dashboard. */
const PREFERENCE_QUESTIONS: { key: string; text: string }[] = [
  { key: "beverage", text: "Vai querer refrigerante?" },
];

async function seedFlavors() {
  // Sem unique em `name` → faz find-or-update por (name, eventId null).
  for (const flavor of GLOBAL_FLAVORS) {
    const existing = await prisma.flavor.findFirst({
      where: { name: flavor.name, eventId: null },
      select: { id: true },
    });
    if (existing) {
      await prisma.flavor.update({
        where: { id: existing.id },
        data: { isSweet: flavor.isSweet ?? false, active: true },
      });
    } else {
      await prisma.flavor.create({
        data: { name: flavor.name, isSweet: flavor.isSweet ?? false },
      });
    }
  }
}

async function seedQuestions() {
  for (const question of PREFERENCE_QUESTIONS) {
    await prisma.preferenceQuestion.upsert({
      where: { key: question.key },
      update: { text: question.text, active: true },
      create: { key: question.key, text: question.text },
    });
  }
}

async function main() {
  await seedFlavors();
  await seedQuestions();
  console.log(
    `✅ Seed concluído: ${GLOBAL_FLAVORS.length} sabores padrão + ${PREFERENCE_QUESTIONS.length} pergunta(s).`,
  );
}

main()
  .catch((error) => {
    console.error("❌ Seed falhou:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
