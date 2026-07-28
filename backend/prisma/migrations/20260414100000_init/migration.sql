-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "email" VARCHAR(255) NOT NULL,
    "office_address" TEXT,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255),
    "manager_name" VARCHAR(255),
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "office_address" TEXT,
    "kp_date" VARCHAR(50),
    "object_name" TEXT,
    "logo_url" TEXT,
    "region" VARCHAR(120),
    "markup_percent" DECIMAL(6,2),
    "discount_percent" DECIMAL(6,2),
    "services" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_constructions" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "calc_params" JSONB NOT NULL,
    "materials" JSONB,
    "montage" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_constructions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "offers_user_id_idx" ON "offers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "offer_constructions_offer_id_position_key" ON "offer_constructions"("offer_id", "position");

-- CreateIndex
CREATE INDEX "offer_constructions_offer_id_idx" ON "offer_constructions"("offer_id");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_constructions" ADD CONSTRAINT "offer_constructions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
