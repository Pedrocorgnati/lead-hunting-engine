-- TASK-9 intake-review (CL-223..226): DuplicateCandidate state machine.
-- Adiciona enum DuplicateStatus + campos de merge/undo + snapshot em LeadHistory.

CREATE TYPE "DuplicateStatus" AS ENUM ('PENDING', 'MERGED', 'KEEP_BOTH', 'REJECTED', 'UNDONE');

-- Converte coluna status (VARCHAR) em enum tipado, preservando valores existentes.
ALTER TABLE "duplicate_candidates"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "duplicate_candidates"
  ALTER COLUMN "status" TYPE "DuplicateStatus"
  USING (
    CASE
      WHEN upper("status") IN ('MERGED')     THEN 'MERGED'::"DuplicateStatus"
      WHEN upper("status") IN ('KEEP_BOTH', 'KEEPBOTH', 'KEEP-BOTH') THEN 'KEEP_BOTH'::"DuplicateStatus"
      WHEN upper("status") IN ('REJECTED')   THEN 'REJECTED'::"DuplicateStatus"
      WHEN upper("status") IN ('UNDONE')     THEN 'UNDONE'::"DuplicateStatus"
      ELSE 'PENDING'::"DuplicateStatus"
    END
  );

ALTER TABLE "duplicate_candidates"
  ALTER COLUMN "status" SET DEFAULT 'PENDING'::"DuplicateStatus";

ALTER TABLE "duplicate_candidates"
  ADD COLUMN "merged_at"       TIMESTAMP(3),
  ADD COLUMN "merged_by"       UUID,
  ADD COLUMN "undone_at"       TIMESTAMP(3),
  ADD COLUMN "undone_by"       UUID,
  ADD COLUMN "merge_snapshot"  JSONB;

ALTER TABLE "lead_history"
  ADD COLUMN "snapshot" JSONB;
