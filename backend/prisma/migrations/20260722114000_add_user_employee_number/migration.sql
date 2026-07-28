-- AlterTable
ALTER TABLE "users" ADD COLUMN "employee_number" INTEGER;

-- Backfill: порядковый номер в компании по дате создания
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at ASC, id ASC) AS rn
  FROM "users"
)
UPDATE "users" AS u
SET "employee_number" = ranked.rn
FROM ranked
WHERE u.id = ranked.id;

UPDATE "users" SET "employee_number" = 1 WHERE "employee_number" IS NULL;

ALTER TABLE "users" ALTER COLUMN "employee_number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_employee_number_key" ON "users"("company_id", "employee_number");
