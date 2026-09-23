-- Ordenação dos itens na hora de pedir: agregado derivado (cache) do total de
-- unidades já pedidas por item. A fonte da verdade continua sendo OrderItem, e
-- esta coluna é recalculada do zero a cada criação de rodada STANDARD.

ALTER TABLE "Item" ADD COLUMN "orderCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: mesma agregação da recomputação, sem o recorte por Type (roda uma vez).
-- O FILTER (e não um WHERE) é o que descarta pedido cancelado/expirado sem
-- descartar o item inteiro.
UPDATE "Item" AS i
SET "orderCount" = agg.total
FROM (
  SELECT it."id" AS "itemId",
         COALESCE(
           SUM(oi."quantity") FILTER (
             WHERE o."status" IN ('PENDING', 'CONFIRMED', 'DELIVERED')
           ),
           0
         )::int AS total
  FROM "Item" it
  LEFT JOIN "OrderItem" oi ON oi."itemId" = it."id"
  LEFT JOIN "Order" o ON o."id" = oi."orderId"
  GROUP BY it."id"
) AS agg
WHERE agg."itemId" = i."id" AND i."orderCount" IS DISTINCT FROM agg.total;

CREATE INDEX "Item_typeId_orderCount_idx" ON "Item"("typeId", "orderCount" DESC);
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");
