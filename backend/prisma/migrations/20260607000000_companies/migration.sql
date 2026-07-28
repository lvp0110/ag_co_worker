-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "ogrn" VARCHAR(50),
    "kpp" VARCHAR(50),
    "inn" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- Default company (значения из DEFAULT_FOOTER, см. backend/src/templates/offerKp.ts).
-- К ней привязываем всех существующих пользователей.
INSERT INTO "companies" ("id", "name", "address", "ogrn", "kpp", "inn", "created_at", "updated_at")
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'ООО «Шуманет Шоп»',
    '115054, Москва г, Новокузнецкая ул, дом 33, строение 2',
    '1177746342157',
    '770501001',
    '9705093593',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- AlterTable: добавляем role и company_id (company_id сначала nullable для backfill)
ALTER TABLE "users" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER';
ALTER TABLE "users" ADD COLUMN "company_id" UUID;

-- Backfill: всех существующих пользователей привязываем к дефолтной компании
UPDATE "users" SET "company_id" = '00000000-0000-0000-0000-000000000001' WHERE "company_id" IS NULL;

-- Теперь делаем company_id обязательным
ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: убираем фирменные поля с Offer (теперь живут на Company)
ALTER TABLE "offers" DROP COLUMN "company_name",
DROP COLUMN "company_address",
DROP COLUMN "ogrn",
DROP COLUMN "kpp",
DROP COLUMN "inn";
