-- Encomenda (STANDARD) — meta de valor por rodada. Migração aditiva.
-- A meta vive numa tabela 1:1 para que nome e alvo sejam NOT NULL juntos e para
-- que a linha possa ser travada (FOR UPDATE) na detecção de "meta atingida".

-- CreateTable: EventGoal
CREATE TABLE "EventGoal" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmountCents" INTEGER NOT NULL,
    "reachedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventGoal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventGoal_eventId_key" ON "EventGoal"("eventId");

ALTER TABLE "EventGoal" ADD CONSTRAINT "EventGoal_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Order — snapshot da decisão "este pedido compõe a meta".
-- DEFAULT false é o backfill correto: nenhuma rodada tinha meta antes desta
-- migration, e o ramo do racha continua sem escrever o campo.
ALTER TABLE "Order" ADD COLUMN "countsTowardGoal" BOOLEAN NOT NULL DEFAULT false;

-- Índice do progresso: soma os pedidos que compõem a meta de uma rodada.
CREATE INDEX "Order_eventId_countsTowardGoal_status_idx"
    ON "Order"("eventId", "countsTowardGoal", "status");
