-- Cadastro de template passa a diferenciar canal (email|whatsapp|telefone) e
-- guardar assunto (so usado em e-mail).
ALTER TABLE "pitch_templates" ADD COLUMN IF NOT EXISTS "channel" VARCHAR(20) NOT NULL DEFAULT 'email';
ALTER TABLE "pitch_templates" ADD COLUMN IF NOT EXISTS "subject" VARCHAR(255);
