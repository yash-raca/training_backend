/*
  Warnings:

  - You are about to drop the column `allowReview` on the `assessments` table. All the data in the column will be lost.
  - You are about to drop the column `endDate` on the `assessments` table. All the data in the column will be lost.
  - You are about to drop the column `showResults` on the `assessments` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `assessments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "assessment_submissions" ADD COLUMN     "checkedAt" TIMESTAMP(3),
ADD COLUMN     "checkedBy" INTEGER,
ADD COLUMN     "isCheckedByTeacher" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "assessments" DROP COLUMN "allowReview",
DROP COLUMN "endDate",
DROP COLUMN "showResults",
DROP COLUMN "startDate";

-- AddForeignKey
ALTER TABLE "assessment_submissions" ADD CONSTRAINT "assessment_submissions_checkedBy_fkey" FOREIGN KEY ("checkedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
