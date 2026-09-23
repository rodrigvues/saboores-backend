-- Racha Geral (GENERAL_SPLIT) — migração aditiva. Nenhuma linha existente muda de
-- comportamento: rodadas atuais continuam STANDARD/PIZZA_SPLIT e as colunas novas
-- de "Order" nascem NULL. Os CHECKs são o contrato que o service não pode furar.

-- AlterEnum: terceiro modo de rodada (enum nativo do PG só aceita adição)
ALTER TYPE "EventKind" ADD VALUE IF NOT EXISTS 'GENERAL_SPLIT';

-- CreateEnum: como o valor por pessoa é definido no racha geral
CREATE TYPE "SplitMode" AS ENUM ('DYNAMIC', 'TARGET');

-- CreateTable: uma linha por racha geral; é ela que serializa as escritas
CREATE TABLE "GeneralSplit" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "purchaseName" TEXT NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "mode" "SplitMode" NOT NULL,
    "targetParticipants" INTEGER,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "pinnedBps" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneralSplit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneralSplit_eventId_key" ON "GeneralSplit"("eventId");

-- AddForeignKey
ALTER TABLE "GeneralSplit" ADD CONSTRAINT "GeneralSplit_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras estruturais que o banco garante mesmo se o service errar
ALTER TABLE "GeneralSplit" ADD CONSTRAINT "GeneralSplit_total_positive_chk"
    CHECK ("totalAmountCents" > 0);

ALTER TABLE "GeneralSplit" ADD CONSTRAINT "GeneralSplit_mode_target_chk"
    CHECK (
      ("mode" = 'TARGET'  AND "targetParticipants" IS NOT NULL AND "targetParticipants" >= 2)
      OR
      ("mode" = 'DYNAMIC' AND "targetParticipants" IS NULL)
    );

ALTER TABLE "GeneralSplit" ADD CONSTRAINT "GeneralSplit_pinned_bps_chk"
    CHECK ("pinnedBps" >= 0 AND "pinnedBps" <= 10000);

ALTER TABLE "GeneralSplit" ADD CONSTRAINT "GeneralSplit_participant_count_chk"
    CHECK ("participantCount" >= 0);

-- TARGET não pode passar do alvo; o UPDATE condicional do plano 02 já impede,
-- este CHECK é a rede embaixo da rede.
ALTER TABLE "GeneralSplit" ADD CONSTRAINT "GeneralSplit_count_within_target_chk"
    CHECK ("targetParticipants" IS NULL OR "participantCount" <= "targetParticipants");

-- "Completo" só existe no TARGET; o dinâmico termina por settledAt, não por lotação.
ALTER TABLE "GeneralSplit" ADD CONSTRAINT "GeneralSplit_completed_only_target_chk"
    CHECK ("mode" = 'TARGET' OR "completedAt" IS NULL);

-- AlterTable: Order ganha a participação do racha geral
ALTER TABLE "Order" ADD COLUMN     "sharePercentBps" INTEGER;
ALTER TABLE "Order" ADD COLUMN     "amountDueCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN     "idempotencyKey" TEXT;

ALTER TABLE "Order" ADD CONSTRAINT "Order_share_percent_bps_chk"
    CHECK ("sharePercentBps" IS NULL OR ("sharePercentBps" >= 0 AND "sharePercentBps" <= 10000));

ALTER TABLE "Order" ADD CONSTRAINT "Order_amount_due_cents_chk"
    CHECK ("amountDueCents" IS NULL OR "amountDueCents" >= 0);

-- CreateIndex: idempotência da entrada (vários NULL são permitidos no PG)
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex: leitura canônica do racha é "participações do evento em ordem de
-- entrada"; o composto cobre também o filtro só por eventId, então o simples sai.
DROP INDEX IF EXISTS "Order_eventId_idx";
CREATE INDEX "Order_eventId_createdAt_idx" ON "Order"("eventId", "createdAt");
