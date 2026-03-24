-- CreateTable: notifications (ST002 — TASK-AUDIT-2 in-app notification persistence)
CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" VARCHAR(50) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "data" JSONB,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "user_profiles"("id") ON DELETE CASCADE
);

CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
