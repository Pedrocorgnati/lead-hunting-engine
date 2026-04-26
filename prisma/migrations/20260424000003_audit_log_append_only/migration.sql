-- TASK-24 intake-review (CL-352): audit_logs append-only via trigger Postgres.
-- Defesa em profundidade alem da garantia a nivel de aplicacao (audit-service).
-- UPDATE/DELETE sao bloqueados; TRUNCATE via superuser permanece possivel (documentado).

CREATE OR REPLACE FUNCTION audit_log_readonly() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only — UPDATE/DELETE denied'
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_mod_update ON "audit_logs";
CREATE TRIGGER audit_log_no_mod_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_log_readonly();

DROP TRIGGER IF EXISTS audit_log_no_mod_delete ON "audit_logs";
CREATE TRIGGER audit_log_no_mod_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_log_readonly();

COMMENT ON TABLE "audit_logs" IS 'Append-only: UPDATE/DELETE bloqueado por trigger audit_log_readonly. TRUNCATE requer superuser. Ver docs/runbooks/audit-log-append-only.md.';
