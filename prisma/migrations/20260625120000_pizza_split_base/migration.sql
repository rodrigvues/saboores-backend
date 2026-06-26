-- Racha de Pizza (PIZZA_SPLIT) — migração aditiva. Rodadas atuais viram STANDARD.
-- `Event.typeId` passa a ser opcional (pizza não usa Type).

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('STANDARD', 'PIZZA_SPLIT');

-- AlterTable: Event — typeId opcional + config do racha + custo/ciclo de vida
ALTER TABLE "Event" ALTER COLUMN "typeId" DROP NOT NULL;
ALTER TABLE "Event" ADD COLUMN     "kind" "EventKind" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Event" ADD COLUMN     "maxFlavorsPerOrder" INTEGER;
ALTER TABLE "Event" ADD COLUMN     "slicesPerPizza" INTEGER;
ALTER TABLE "Event" ADD COLUMN     "avgLargePizzaPrice" DECIMAL(65,30);
ALTER TABLE "Event" ADD COLUMN     "pixKey" TEXT;
ALTER TABLE "Event" ADD COLUMN     "pixQrUrl" TEXT;
ALTER TABLE "Event" ADD COLUMN     "actualTotalCost" DECIMAL(65,30);
ALTER TABLE "Event" ADD COLUMN     "costEvidenceUrl" TEXT;
ALTER TABLE "Event" ADD COLUMN     "costRegisteredAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN     "choicesLockedAt" TIMESTAMP(3);

-- AlterTable: Order — participação no racha
ALTER TABLE "Order" ADD COLUMN     "slicesWanted" INTEGER;
ALTER TABLE "Order" ADD COLUMN     "amountDue" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "Flavor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSweet" BOOLEAN NOT NULL DEFAULT false,
    "eventId" TEXT,
    "createdByUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flavor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreferenceQuestion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreferenceQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFlavor" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "flavorId" TEXT NOT NULL,

    CONSTRAINT "OrderFlavor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPreference" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" BOOLEAN NOT NULL,

    CONSTRAINT "OrderPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Flavor_eventId_idx" ON "Flavor"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PreferenceQuestion_key_key" ON "PreferenceQuestion"("key");

-- CreateIndex
CREATE INDEX "OrderFlavor_orderId_idx" ON "OrderFlavor"("orderId");

-- CreateIndex
CREATE INDEX "OrderFlavor_flavorId_idx" ON "OrderFlavor"("flavorId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFlavor_orderId_flavorId_key" ON "OrderFlavor"("orderId", "flavorId");

-- CreateIndex
CREATE INDEX "OrderPreference_orderId_idx" ON "OrderPreference"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPreference_orderId_questionId_key" ON "OrderPreference"("orderId", "questionId");

-- AddForeignKey
ALTER TABLE "Flavor" ADD CONSTRAINT "Flavor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFlavor" ADD CONSTRAINT "OrderFlavor_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFlavor" ADD CONSTRAINT "OrderFlavor_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "Flavor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPreference" ADD CONSTRAINT "OrderPreference_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPreference" ADD CONSTRAINT "OrderPreference_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PreferenceQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
