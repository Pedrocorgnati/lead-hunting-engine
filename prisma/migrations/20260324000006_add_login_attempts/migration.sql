-- CreateTable: login_attempts (ST001 — TASK-AUDIT-1 brute-force protection)
CREATE TABLE "login_attempts" (
  "id" TEXT NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "ip_address" VARCHAR(45) NOT NULL,
  "success" BOOLEAN NOT NULL,
  "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_attempts_email_timestamp_idx" ON "login_attempts"("email", "timestamp");
CREATE INDEX "login_attempts_ip_address_timestamp_idx" ON "login_attempts"("ip_address", "timestamp");
