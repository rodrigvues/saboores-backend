-- AlterTable
-- Limite de itens por pedido, agora configurável por rodada (default 15).
ALTER TABLE "Event" ADD COLUMN     "maxItemsPerOrder" INTEGER NOT NULL DEFAULT 15;
