-- TASK-26 intake-review: seed retention policy defaults no system_config.

INSERT INTO "system_config" ("key", "value") VALUES
  ('retention.waitlist_entry_days',        '{"value": 365}'::jsonb),
  ('retention.contact_message_days',       '{"value": 180}'::jsonb),
  ('retention.landing_consent_days',       '{"value": 730}'::jsonb),
  ('retention.export_history_days',        '{"value": 30}'::jsonb),
  ('retention.lead_history_snapshot_days', '{"value": 90}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
