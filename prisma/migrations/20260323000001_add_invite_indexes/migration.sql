-- Add missing indexes to invites table for query performance
-- TASK-0/ST002: index on status (filtering by PENDING/ACCEPTED/etc.)
-- TASK-0/ST002: index on invited_by_id (filtering by admin who created invite)

CREATE INDEX IF NOT EXISTS "invites_status_idx" ON "invites"("status");
CREATE INDEX IF NOT EXISTS "invites_invited_by_id_idx" ON "invites"("invited_by_id");
