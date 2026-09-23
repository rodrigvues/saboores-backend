-- Frente 5 — ranking por temporada + prêmio. Migração ADITIVA: nada é apagado.
-- O ranking passa a filtrar por janela de mês, e o campeão do mês fechado vira
-- uma linha congelada (snapshot de apelido/avatar/pontos).

-- CreateTable
CREATE TABLE "RankingSeason" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "championUserId" TEXT,
    "championDisplayName" TEXT,
    "championAvatarUrl" TEXT,
    "championPoints" INTEGER NOT NULL DEFAULT 0,
    "participants" INTEGER NOT NULL DEFAULT 0,
    "prizeAmountCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingSeason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RankingSeason_period_key" ON "RankingSeason"("period");

-- CreateIndex
CREATE INDEX "RankingSeason_championUserId_idx" ON "RankingSeason"("championUserId");

-- AddForeignKey
ALTER TABLE "RankingSeason" ADD CONSTRAINT "RankingSeason_championUserId_fkey" FOREIGN KEY ("championUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: o ranking deixa de varrer a tabela inteira e passa a filtrar por janela.
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex: base da soma de taxa de serviço do prêmio (pedidos pagos na janela).
CREATE INDEX "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");
