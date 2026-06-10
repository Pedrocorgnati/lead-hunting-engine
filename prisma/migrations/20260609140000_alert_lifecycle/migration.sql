-- Task 45 / AD30: lifecycle de alertas operacionais sobre sent_alerts
ALTER TABLE "sent_alerts" ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "sent_alerts" ADD COLUMN "severity" VARCHAR(20) NOT NULL DEFAULT 'medium';
ALTER TABLE "sent_alerts" ADD COLUMN "message" TEXT;
ALTER TABLE "sent_alerts" ADD COLUMN "silenced_until" TIMESTAMP(3);
ALTER TABLE "sent_alerts" ADD COLUMN "resolved_at" TIMESTAMP(3);
ALTER TABLE "sent_alerts" ADD COLUMN "updated_by" UUID;
