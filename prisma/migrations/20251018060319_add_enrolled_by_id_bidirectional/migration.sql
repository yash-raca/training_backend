/*
  Warnings:

  - Added the required column `enrolledById` to the `Enrollment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "enrolledById" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Module" ALTER COLUMN "videoLink" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_enrolledById_fkey" FOREIGN KEY ("enrolledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
