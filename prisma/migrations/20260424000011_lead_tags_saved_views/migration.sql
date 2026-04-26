-- TASK-16 intake-review (CL-267, CL-490): LeadTag + SavedView per-user.

CREATE TABLE "lead_tags" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "lead_id"    UUID         NOT NULL,
  "user_id"    UUID         NOT NULL,
  "label"      VARCHAR(64)  NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_tags_lead_user_label_key"
  ON "lead_tags" ("lead_id", "user_id", "label");
CREATE INDEX "lead_tags_user_label_idx"
  ON "lead_tags" ("user_id", "label");

CREATE TABLE "saved_views" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID         NOT NULL,
  "name"       VARCHAR(120) NOT NULL,
  "filters"    JSONB        NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_views_user_name_key"
  ON "saved_views" ("user_id", "name");
CREATE INDEX "saved_views_user_created_idx"
  ON "saved_views" ("user_id", "created_at");
