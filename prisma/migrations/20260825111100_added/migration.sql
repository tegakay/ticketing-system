/*
  Warnings:

  - A unique constraint covering the columns `[idempotency_key]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id,idempotency_key]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotency_key_key" ON "Order"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "Order_user_id_idempotency_key_key" ON "Order"("user_id", "idempotency_key");
