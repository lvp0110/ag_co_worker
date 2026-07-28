-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "logo_url" TEXT;

-- AlterTable
ALTER TABLE "offers" DROP COLUMN "logo_url";
