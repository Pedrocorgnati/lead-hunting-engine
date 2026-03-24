-- Migration: Add DISQUALIFIED and NEGOTIATING to LeadStatus enum
-- module-14-lead-dashboard / TASK-0 / ST003

-- Adicionar novos valores ao enum LeadStatus
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'NEGOTIATING';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'DISQUALIFIED';
