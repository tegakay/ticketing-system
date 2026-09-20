-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "performer_id" TEXT;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_performer_id_fkey" FOREIGN KEY ("performer_id") REFERENCES "Performer"("performer_id") ON DELETE SET NULL ON UPDATE CASCADE;
