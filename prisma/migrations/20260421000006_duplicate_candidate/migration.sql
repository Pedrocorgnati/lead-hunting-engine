-- CreateTable
CREATE TABLE "duplicate_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "primary_lead_id" UUID NOT NULL,
    "candidate_lead_id" UUID NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "resolution" VARCHAR(20),
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "duplicate_candidates_primary_candidate_key"
  ON "duplicate_candidates"("primary_lead_id", "candidate_lead_id");
CREATE INDEX "duplicate_candidates_user_id_status_idx"
  ON "duplicate_candidates"("user_id", "status");
CREATE INDEX "duplicate_candidates_status_created_at_idx"
  ON "duplicate_candidates"("status", "created_at");
