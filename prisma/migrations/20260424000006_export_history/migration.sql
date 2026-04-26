-- TASK-22 intake-review: ExportHistory + enums para export assincrono.

CREATE TYPE "ExportHistoryStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'JSON', 'VCF');

CREATE TABLE "export_history" (
    "id"           UUID            NOT NULL DEFAULT gen_random_uuid(),
    "user_id"      UUID            NOT NULL,
    "format"       "ExportFormat"  NOT NULL DEFAULT 'CSV',
    "status"       "ExportHistoryStatus" NOT NULL DEFAULT 'PENDING',
    "filters"      JSONB,
    "row_count"    INTEGER,
    "file_url"     TEXT,
    "file_size"    INTEGER,
    "error"        TEXT,
    "started_at"   TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at"   TIMESTAMP(3),
    "created_at"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "export_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "export_history_user_created_idx" ON "export_history" ("user_id", "created_at");
CREATE INDEX "export_history_status_created_idx" ON "export_history" ("status", "created_at");
