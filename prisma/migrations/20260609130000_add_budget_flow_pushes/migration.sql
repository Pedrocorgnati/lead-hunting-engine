-- Task 52 / A18: persistencia dos pushes do fluxo dedicado BudgetFlow
CREATE TABLE "budget_flow_pushes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "campaign_id" VARCHAR(120) NOT NULL,
    "budget" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "note" TEXT,
    "lead_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "payload" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "delivery_mode" VARCHAR(30),
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_flow_pushes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "budget_flow_pushes_user_id_created_at_idx" ON "budget_flow_pushes"("user_id", "created_at");
