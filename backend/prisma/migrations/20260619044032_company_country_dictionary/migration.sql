-- CreateTable: справочник стран
CREATE TABLE "countries" (
    "code" VARCHAR(2) NOT NULL,
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- Seed: страны справочника (нужны до FK, т.к. companies.country_code получает дефолт 'RU')
INSERT INTO "countries" ("code", "name") VALUES
    ('RU', 'Россия'),
    ('KZ', 'Казахстан'),
    ('BY', 'Беларусь');

-- AlterTable: на компании хранится только код страны, имя живёт в справочнике
ALTER TABLE "companies" ADD COLUMN "country_code" VARCHAR(2) NOT NULL DEFAULT 'RU';

-- CreateIndex
CREATE INDEX "companies_country_code_idx" ON "companies"("country_code");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
