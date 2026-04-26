-- CreateTable: ScoringRuleHistory
CREATE TABLE "scoring_rule_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rule_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_by" UUID,
    "change_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_rule_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scoring_rule_history_rule_id_created_at_idx"
  ON "scoring_rule_history"("rule_id", "created_at");

-- CreateTable: PitchVersion
CREATE TABLE "pitch_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lead_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "tone" VARCHAR(50),
    "provider" VARCHAR(50),
    "changed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pitch_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pitch_versions_lead_id_created_at_idx"
  ON "pitch_versions"("lead_id", "created_at");
