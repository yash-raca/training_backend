/*
  Warnings:

  - Made the column `category` on table `Capability` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Capability" ALTER COLUMN "category" SET NOT NULL;
