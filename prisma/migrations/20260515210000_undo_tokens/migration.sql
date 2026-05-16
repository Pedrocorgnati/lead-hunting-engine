-- CL-340: undo tokens efemeros para reversao de operacoes destrutivas em leads.
-- Consumidos pelo endpoint POST /api/v1/leads/[id]/undo (lib/leads/undo-store.ts).

CREATE TABLE "undo_tokens" (
    "token" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "undo_tokens_pkey" PRIMARY KEY ("token")
);

CREATE INDEX "undo_tokens_lead_id_idx" ON "undo_tokens"("lead_id");
CREATE INDEX "undo_tokens_expires_at_idx" ON "undo_tokens"("expires_at");
