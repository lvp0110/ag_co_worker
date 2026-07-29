-- Убираем локальную нумерацию КП/сотрудника и мёртвый password_hash.
-- Номер КП = document_id из 1С (= offers.id).

DROP INDEX IF EXISTS "offers_user_id_kp_number_key";
ALTER TABLE "offers" DROP COLUMN IF EXISTS "kp_number";

DROP INDEX IF EXISTS "users_department_id_employee_number_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "employee_number";
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
