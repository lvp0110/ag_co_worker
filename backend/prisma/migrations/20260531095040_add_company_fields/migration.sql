-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "company_address" TEXT,
ADD COLUMN     "company_name" VARCHAR(255),
ADD COLUMN     "inn" VARCHAR(50),
ADD COLUMN     "kpp" VARCHAR(50),
ADD COLUMN     "ogrn" VARCHAR(50);
