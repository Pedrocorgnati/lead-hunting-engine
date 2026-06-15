-- Contato direto (F-1 WhatsApp/telefone): supressao "nao perturbe" por numero.
-- AlterEnum
ALTER TYPE "SuppressionKind" ADD VALUE IF NOT EXISTS 'PHONE';
