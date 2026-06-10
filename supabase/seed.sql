-- supabase/seed.sql — usuarios de auth locais (dev only)
-- Espelha os anchor UUIDs de prisma/seed/dev.ts (SEED-CATALOG.md).
-- Senha de todos os usuarios dev: DevLocal123!
-- Executado automaticamente por `supabase db reset`; idempotente via ON CONFLICT.

DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-000000000001'::uuid, 'admin@dev.local'),
      ('00000000-0000-0000-0000-000000000002'::uuid, 'operador@dev.local'),
      ('00000000-0000-0000-0000-000000000003'::uuid, 'novato@dev.local'),
      ('00000000-0000-0000-0000-000000000004'::uuid, 'saindo@dev.local')
    ) AS t(id, email)
  LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, extensions.crypt('DevLocal123!', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{}',
      now(), now(), '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), u.id, u.id::text, 'email',
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      now(), now(), now()
    )
    ON CONFLICT (provider_id, provider) DO NOTHING;
  END LOOP;
END $$;
