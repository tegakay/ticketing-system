/*
  Warnings:

  - Made the column `venue_id` on table `Event` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "description" TEXT,
ALTER COLUMN "venue_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "Venue"("venue_id") ON DELETE RESTRICT ON UPDATE CASCADE;
