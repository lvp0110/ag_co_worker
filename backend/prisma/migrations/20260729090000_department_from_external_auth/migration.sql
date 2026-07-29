-- Компания больше не хранится локально: сотрудник привязан к отделу
-- (`department_id` из GET /auth/session внешнего auth-сервиса), реквизиты КП
-- переехали в конфиг backend (KP_COMPANY_*).

-- AlterTable: users.company_id → users.department_id
ALTER TABLE "users" DROP CONSTRAINT "users_company_id_fkey";
DROP INDEX "users_company_id_employee_number_key";
DROP INDEX "users_company_id_idx";
ALTER TABLE "users" DROP COLUMN "company_id";
ALTER TABLE "users" ADD COLUMN "department_id" INTEGER NOT NULL DEFAULT 0;

-- Номера сотрудников были уникальны внутри компании; после схлопывания всех
-- в department_id = 0 они могут столкнуться, поэтому перенумеровываем по дате
-- создания. Реальный отдел и новый номер сотрудник получит при первом входе
-- (см. upsertLocalUserFromExternal).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM "users"
)
UPDATE "users" AS u
SET "employee_number" = ranked.rn
FROM ranked
WHERE u.id = ranked.id;

-- CreateIndex
CREATE UNIQUE INDEX "users_department_id_employee_number_key" ON "users"("department_id", "employee_number");
CREATE INDEX "users_department_id_idx" ON "users"("department_id");

-- DropTable
DROP TABLE "companies";
DROP TABLE "countries";
