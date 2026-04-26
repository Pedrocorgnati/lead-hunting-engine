/**
 * Schemas Zod para operações genéricas sobre Lead.
 *
 * Nota: o modelo Prisma `Lead` atual não possui os campos `tags`, `customFields`
 * ou `assignedTo` — a spec original da TASK-6 assumia uma versão estendida do
 * modelo que ainda não existe. O `LeadPatchSchema` abaixo cobre apenas os
 * campos realmente persistidos hoje. Adicionar novos campos requer migration
 * prévia no Prisma (tratado em outra onda do intake-review).
 */

import { z } from 'zod'
import { TONE_OPTIONS } from '@/lib/pitch/tone-config'

export const LEAD_STATUS_VALUES = [
  'NEW',
  'CONTACTED',
  'NEGOTIATING',
  'CONVERTED',
  'DISCARDED',
  'DISQUALIFIED',
  'FALSE_POSITIVE',
  'ENRICHMENT_PENDING',
] as const

export const LeadPatchSchema = z
  .object({
    notes: z.string().max(5000, 'Máximo 5000 caracteres.').nullable().optional(),
    status: z.enum(LEAD_STATUS_VALUES).optional(),
    pitchContent: z.string().min(1).optional(),
    pitchTone: z.enum(TONE_OPTIONS).optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Envie ao menos um campo para atualizar.',
  })

export type LeadPatchInput = z.infer<typeof LeadPatchSchema>
