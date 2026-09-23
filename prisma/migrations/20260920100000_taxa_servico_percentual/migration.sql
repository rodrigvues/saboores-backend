-- Taxa de serviço da encomenda deixa de ser valor fixo por pedido e passa a ser
-- percentual sobre o subtotal. Não há como derivar percentual de um valor fixo:
-- TODAS as rodadas que cobravam taxa são DESLIGADAS, em qualquer status.
-- Os pedidos já criados mantêm `Order.serviceFee` (histórico em reais) intacto.

-- 1. Colunas novas (aditivo).
ALTER TABLE "Event" ADD COLUMN "serviceFeePercent" DECIMAL(65,30);
ALTER TABLE "Order" ADD COLUMN "serviceFeePercent" DECIMAL(65,30);

-- 2. Trilha de auditoria de TODA rodada que perdeu a taxa, qualquer status (antes de
--    apagar o valor: a coluna some no passo 4 e o AuditLog vira o único registro dele).
INSERT INTO "AuditLog" ("id", "actorId", "action", "targetId", "metadata", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  e."createdByUserId",
  'EVENT_SERVICE_FEE_MIGRATED',
  e."id",
  jsonb_build_object(
    'reason', 'taxa fixa por pedido virou percentual',
    'previousServiceFeeAmount', e."serviceFeeAmount"::text,
    'eventStatus', e."status"::text
  ),
  now()
FROM "Event" e
WHERE e."hasServiceFee" = true;

-- 3. Desliga a taxa em TODAS as rodadas, inclusive CLOSED: `hasServiceFee = true` sem
--    percentual é estado inválido pela RN-2, e uma CLOSED volta a OPEN com um
--    `PATCH /events/:id {"status":"OPEN"}` (o schema aceita status livre e o service
--    não valida transição), reabrindo com a taxa ligada e sem percentual.
UPDATE "Event"
SET "hasServiceFee" = false
WHERE "hasServiceFee" = true;

-- 4. Remove a coluna do valor fixo (destrutivo e intencional).
ALTER TABLE "Event" DROP COLUMN "serviceFeeAmount";
