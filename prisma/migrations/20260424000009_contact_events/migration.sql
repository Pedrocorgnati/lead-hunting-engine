-- TASK-18/ST005 (CL-283): contact_events — canal + resultado estruturados.

CREATE TYPE "ContactChannel" AS ENUM ('WHATSAPP','EMAIL','TELEFONE','PRESENCIAL','OUTRO');
CREATE TYPE "ContactOutcome" AS ENUM ('NO_ANSWER','ANSWERED','INTERESTED','REJECTED','SCHEDULED');

CREATE TABLE "contact_events" (
  "id"         UUID            NOT NULL DEFAULT gen_random_uuid(),
  "lead_id"    UUID            NOT NULL,
  "user_id"    UUID            NOT NULL,
  "channel"    "ContactChannel" NOT NULL,
  "outcome"    "ContactOutcome" NOT NULL,
  "note"       TEXT,
  "created_at" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_events_lead_id_created_at_idx"
  ON "contact_events" ("lead_id", "created_at");
CREATE INDEX "contact_events_user_id_created_at_idx"
  ON "contact_events" ("user_id", "created_at");
