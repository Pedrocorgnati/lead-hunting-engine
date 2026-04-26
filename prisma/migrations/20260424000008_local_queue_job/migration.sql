-- TASK-15 intake-review (CL-173): fila local como fallback ao trigger.dev.

CREATE TABLE "local_queue_jobs" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "kind"          VARCHAR(80)  NOT NULL,
    "payload_hash"  VARCHAR(64)  NOT NULL,
    "payload"       JSONB        NOT NULL,
    "status"        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    "attempts"      INTEGER      NOT NULL DEFAULT 0,
    "leased_until"  TIMESTAMP(3),
    "last_error"    TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "run_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "local_queue_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "local_queue_jobs_kind_payload_hash_key"
  ON "local_queue_jobs" ("kind", "payload_hash");

CREATE INDEX "local_queue_jobs_status_run_at_idx"
  ON "local_queue_jobs" ("status", "run_at");
