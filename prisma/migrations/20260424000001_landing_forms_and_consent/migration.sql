-- TASK-2 + TASK-3 intake-review: landing forms + LGPD consent

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('PENDING', 'INVITED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'READ', 'REPLIED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('AGENCIA', 'CONSULTORIA', 'SDR', 'FREELA', 'OUTRO');

-- CreateTable — waitlist_entries (CL-310, CL-403, CL-495)
CREATE TABLE "waitlist_entries" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "email"            VARCHAR(255) NOT NULL,
  "name"             VARCHAR(255),
  "business_type"    "BusinessType",
  "status"           "WaitlistStatus" NOT NULL DEFAULT 'PENDING',
  "invited_at"       TIMESTAMP(3),
  "invited_by_id"    UUID,
  "ip"               VARCHAR(45),
  "user_agent"       VARCHAR(500),
  "consent_lgpd"     BOOLEAN NOT NULL DEFAULT false,
  "consent_id"       UUID,
  "retention_until"  TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "waitlist_entries_email_key" ON "waitlist_entries"("email");
CREATE INDEX "waitlist_entries_status_created_at_idx" ON "waitlist_entries"("status", "created_at");
CREATE INDEX "waitlist_entries_retention_until_idx" ON "waitlist_entries"("retention_until");

-- CreateTable — contact_messages (CL-311, CL-403, CL-494)
CREATE TABLE "contact_messages" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "email"            VARCHAR(255) NOT NULL,
  "name"             VARCHAR(255) NOT NULL,
  "subject"          VARCHAR(255) NOT NULL,
  "message"          TEXT NOT NULL,
  "status"           "ContactStatus" NOT NULL DEFAULT 'NEW',
  "replied_at"       TIMESTAMP(3),
  "replied_by_id"    UUID,
  "reply_content"    TEXT,
  "ip"               VARCHAR(45),
  "user_agent"       VARCHAR(500),
  "consent_lgpd"     BOOLEAN NOT NULL DEFAULT false,
  "consent_id"       UUID,
  "retention_until"  TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_messages_status_created_at_idx" ON "contact_messages"("status", "created_at");
CREATE INDEX "contact_messages_email_idx" ON "contact_messages"("email");
CREATE INDEX "contact_messages_retention_until_idx" ON "contact_messages"("retention_until");

-- CreateTable — landing_consents (CL-312)
CREATE TABLE "landing_consents" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "ip_hash"              VARCHAR(64) NOT NULL,
  "user_agent"           VARCHAR(500) NOT NULL,
  "version"              VARCHAR(20) NOT NULL,
  "categories"           TEXT[] DEFAULT ARRAY[]::TEXT[],
  "waitlist_entry_id"    UUID,
  "contact_message_id"   UUID,
  "accepted_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "landing_consents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "landing_consents_ip_hash_idx" ON "landing_consents"("ip_hash");
CREATE INDEX "landing_consents_accepted_at_idx" ON "landing_consents"("accepted_at");
