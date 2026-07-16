-- Encomenda (STANDARD) — taxa de serviço opcional por pedido. Migração aditiva.
-- A taxa é configurada na rodada e "congelada" (snapshot) em cada pedido criado.

-- AlterTable: Event — flag + valor da taxa de serviço
ALTER TABLE "Event" ADD COLUMN     "hasServiceFee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN     "serviceFeeAmount" DECIMAL(65,30);

-- AlterTable: Order — snapshot da taxa no momento do pedido
ALTER TABLE "Order" ADD COLUMN     "serviceFee" DECIMAL(65,30);
