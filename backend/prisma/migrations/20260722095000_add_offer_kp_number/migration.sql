-- AlterTable
ALTER TABLE "offers" ADD COLUMN "kp_number" INTEGER;

-- Backfill: порядковый номер по пользователю в порядке создания
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
  FROM "offers"
)
UPDATE "offers" AS o
SET "kp_number" = ranked.rn
FROM ranked
WHERE o.id = ranked.id;

-- На случай пустой таблицы / новых строк без backfill
UPDATE "offers" SET "kp_number" = 1 WHERE "kp_number" IS NULL;

ALTER TABLE "offers" ALTER COLUMN "kp_number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "offers_user_id_kp_number_key" ON "offers"("user_id", "kp_number");
