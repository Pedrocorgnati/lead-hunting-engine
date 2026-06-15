-- outreach-engine (brainstorm 06-10: integracao-email-hostinger-lead-hunting)
-- F-09 campanhas cold-outbound, F-10 supressao, F-11 janela/kill-switch,
-- F-12 inbound, F-18 multicanal, F-22 replay seguro, tasks 02/03/04/19/23/24.

-- ── Enums novos ──────────────────────────────────────────────────────────
CREATE TYPE "OutreachChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'LINKEDIN');
CREATE TYPE "OutreachMailboxStatus" AS ENUM ('ACTIVE', 'PAUSED', 'UNHEALTHY');
CREATE TYPE "OutreachCampaignStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "OutreachDispatchStatus" AS ENUM ('SCHEDULED', 'LOCKED', 'SENDING', 'SENT', 'FAILED', 'AMBIGUOUS', 'FAILED_PERMANENT', 'SUPPRESSED', 'CANCELLED');
CREATE TYPE "SuppressionKind" AS ENUM ('EMAIL', 'DOMAIN');
CREATE TYPE "SuppressionReason" AS ENUM ('BOUNCED', 'UNSUBSCRIBED', 'REPLIED', 'COMPLAINT', 'MANUAL');

-- ── Extensao de enums existentes ─────────────────────────────────────────
-- Canal LinkedIn no historico de contato (F-18 multicanal).
ALTER TYPE "ContactChannel" ADD VALUE IF NOT EXISTS 'LINKEDIN';
-- Lifecycle de envio/resposta automatizada (F-09/F-12).
ALTER TYPE "ContactOutcome" ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE "ContactOutcome" ADD VALUE IF NOT EXISTS 'BOUNCED';
ALTER TYPE "ContactOutcome" ADD VALUE IF NOT EXISTS 'OPT_OUT';
ALTER TYPE "ContactOutcome" ADD VALUE IF NOT EXISTS 'FORWARDED';
ALTER TYPE "ContactOutcome" ADD VALUE IF NOT EXISTS 'OUT_OF_OFFICE';
ALTER TYPE "ContactOutcome" ADD VALUE IF NOT EXISTS 'AMBIGUOUS';

-- ── ContactEvent: vinculo dispatch->evento + payload estruturado ─────────
ALTER TABLE "contact_events" ADD COLUMN "dispatch_id" UUID;
ALTER TABLE "contact_events" ADD COLUMN "metadata" JSONB;
CREATE INDEX "contact_events_dispatch_id_idx" ON "contact_events"("dispatch_id");

-- ── LocalQueueJob: split tentativa tecnica vs falha de negocio (task 03) ─
ALTER TABLE "local_queue_jobs" ADD COLUMN "failure_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "local_queue_jobs" ADD COLUMN "reason_code" VARCHAR(40);

-- ── Lead: score de integridade de dados (task 19 / F-19) ────────────────
ALTER TABLE "leads" ADD COLUMN "integrity_score" INTEGER;

-- ── ApiUsageLog: colunas agregaveis de qualidade por fonte (task 24/F-05) ─
ALTER TABLE "api_usage_logs" ADD COLUMN "result_count" INTEGER;
ALTER TABLE "api_usage_logs" ADD COLUMN "useful_count" INTEGER;

-- ── ScoringRuleHistory: rastreabilidade por experimento (task 23/F-06) ───
ALTER TABLE "scoring_rule_history" ADD COLUMN "experiment_id" VARCHAR(80);
CREATE INDEX "scoring_rule_history_experiment_id_idx" ON "scoring_rule_history"("experiment_id");

-- ── OutreachMailbox ───────────────────────────────────────────────────────
CREATE TABLE "outreach_mailboxes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" VARCHAR(120) NOT NULL,
    "email_address" VARCHAR(255) NOT NULL,
    "from_name" VARCHAR(255),
    "reply_to" VARCHAR(255),
    "provider" VARCHAR(50) NOT NULL DEFAULT 'hostinger',
    "smtp_host" VARCHAR(255) NOT NULL,
    "smtp_port" INTEGER NOT NULL DEFAULT 465,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT true,
    "imap_host" VARCHAR(255),
    "imap_port" INTEGER,
    "username" VARCHAR(255) NOT NULL,
    "encrypted_password" TEXT,
    "password_iv" VARCHAR(32),
    "status" "OutreachMailboxStatus" NOT NULL DEFAULT 'PAUSED',
    "timezone" VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    "send_window_start" VARCHAR(5) NOT NULL DEFAULT '09:00',
    "send_window_end" VARCHAR(5) NOT NULL DEFAULT '18:00',
    "daily_cap" INTEGER NOT NULL DEFAULT 50,
    "min_gap_seconds" INTEGER NOT NULL DEFAULT 90,
    "jitter_seconds" INTEGER NOT NULL DEFAULT 60,
    "region" VARCHAR(10),
    "last_sent_at" TIMESTAMP(3),
    "last_error" VARCHAR(1000),
    "last_inbound_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_mailboxes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outreach_mailboxes_email_address_key" ON "outreach_mailboxes"("email_address");
CREATE INDEX "outreach_mailboxes_status_idx" ON "outreach_mailboxes"("status");

-- ── OutreachSequence + steps ─────────────────────────────────────────────
CREATE TABLE "outreach_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "paused_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outreach_sequence_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "channel" "OutreachChannel" NOT NULL DEFAULT 'EMAIL',
    "subject_template" VARCHAR(500),
    "body_template" TEXT NOT NULL,
    "wait_hours" INTEGER NOT NULL DEFAULT 72,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_sequence_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outreach_sequence_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id")
      REFERENCES "outreach_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "outreach_sequence_steps_sequence_id_step_order_channel_key"
  ON "outreach_sequence_steps"("sequence_id", "step_order", "channel");

-- ── OutreachCampaign ─────────────────────────────────────────────────────
CREATE TABLE "outreach_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" "OutreachCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "market" VARCHAR(10) NOT NULL DEFAULT 'BR',
    "niche" VARCHAR(255),
    "sequence_id" UUID,
    "kill_switch" BOOLEAN NOT NULL DEFAULT false,
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "market_gate_approved_by" UUID,
    "market_gate_approved_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "pause_reason" VARCHAR(500),
    "sla_hours" INTEGER,
    "ab_config" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_campaigns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outreach_campaigns_sequence_id_fkey" FOREIGN KEY ("sequence_id")
      REFERENCES "outreach_sequences"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "outreach_campaigns_user_id_status_idx" ON "outreach_campaigns"("user_id", "status");

-- ── OutreachDispatch ─────────────────────────────────────────────────────
CREATE TABLE "outreach_dispatches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "campaign_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mailbox_id" UUID,
    "sequence_step" INTEGER NOT NULL DEFAULT 1,
    "channel" "OutreachChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "OutreachDispatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "to_email" VARCHAR(255),
    "to_domain" VARCHAR(255),
    "subject" VARCHAR(500),
    "ab_variant" VARCHAR(10),
    "replay_token" VARCHAR(80) NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "message_id" VARCHAR(500),
    "smtp_response" VARCHAR(1000),
    "reason_code" VARCHAR(40),
    "fail_reason" VARCHAR(2000),
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "contact_event_id" UUID,
    "reply_outcome" VARCHAR(40),
    "replied_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_dispatches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outreach_dispatches_campaign_id_fkey" FOREIGN KEY ("campaign_id")
      REFERENCES "outreach_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "outreach_dispatches_mailbox_id_fkey" FOREIGN KEY ("mailbox_id")
      REFERENCES "outreach_mailboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "outreach_dispatches_replay_token_key" ON "outreach_dispatches"("replay_token");
CREATE INDEX "outreach_dispatches_campaign_id_status_idx" ON "outreach_dispatches"("campaign_id", "status");
CREATE INDEX "outreach_dispatches_lead_id_created_at_idx" ON "outreach_dispatches"("lead_id", "created_at");
CREATE INDEX "outreach_dispatches_status_scheduled_at_idx" ON "outreach_dispatches"("status", "scheduled_at");
CREATE INDEX "outreach_dispatches_mailbox_id_sent_at_idx" ON "outreach_dispatches"("mailbox_id", "sent_at");
CREATE INDEX "outreach_dispatches_to_domain_sent_at_idx" ON "outreach_dispatches"("to_domain", "sent_at");

-- Invariante 1.1 do fonte (task 02): nenhum lead com 2 envios ativos no
-- mesmo canal. Partial unique index — fora do alcance da DSL do Prisma;
-- documentado no schema.prisma junto ao model OutreachDispatch.
CREATE UNIQUE INDEX "outreach_dispatch_one_active_per_lead_channel"
  ON "outreach_dispatches"("lead_id", "channel")
  WHERE "status" IN ('SCHEDULED', 'LOCKED', 'SENDING');

-- ── SuppressionEntry ─────────────────────────────────────────────────────
CREATE TABLE "suppression_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "SuppressionKind" NOT NULL,
    "value" VARCHAR(320) NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" VARCHAR(50),
    "cooldown_until" TIMESTAMP(3),
    "notes" VARCHAR(500),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppression_entries_kind_value_key" ON "suppression_entries"("kind", "value");
CREATE INDEX "suppression_entries_cooldown_until_idx" ON "suppression_entries"("cooldown_until");
