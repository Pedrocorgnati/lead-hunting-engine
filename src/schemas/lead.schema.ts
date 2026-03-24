import { z } from 'zod'
import { TONE_OPTIONS } from '@/lib/pitch/tone-config'

export const UpdateLeadStatusSchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'NEGOTIATING', 'CONVERTED', 'DISCARDED', 'DISQUALIFIED', 'FALSE_POSITIVE', 'ENRICHMENT_PENDING']),
})

export const UpdateLeadNotesSchema = z.object({
  notes: z.string().max(5000, 'Máximo 5000 caracteres'),
})

export const UpdateLeadPitchSchema = z.object({
  pitchContent: z.string().min(1),
  pitchTone: z.enum(TONE_OPTIONS).default('formal'),
})

export const RegeneratePitchSchema = z.object({
  tone: z.enum(TONE_OPTIONS).default('formal'),
})

export const MarkFalsePositiveSchema = z.object({
  reason: z.string().max(500).nullable().optional(),
})

export const LeadListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['score', 'createdAt', 'businessName', 'temperature']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  city: z.string().optional(),
  niche: z.string().optional(),
  status: z.string().optional(),
  temperature: z.string().optional(),
  scoreMin: z.coerce.number().int().min(0).max(10).optional(),
  scoreMax: z.coerce.number().int().min(0).max(10).optional(),
  search: z.string().optional(),
})

export type UpdateLeadStatusInput = z.infer<typeof UpdateLeadStatusSchema>
export type UpdateLeadNotesInput = z.infer<typeof UpdateLeadNotesSchema>
export type UpdateLeadPitchInput = z.infer<typeof UpdateLeadPitchSchema>
export type RegeneratePitchInput = z.infer<typeof RegeneratePitchSchema>
export type MarkFalsePositiveInput = z.infer<typeof MarkFalsePositiveSchema>
export type LeadListQuery = z.infer<typeof LeadListQuerySchema>
