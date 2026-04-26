import { z } from 'zod'

export const UpsertCredentialSchema = z.object({
  apiKey: z.string().min(1, 'Chave de API é obrigatória'),
})

export const UpdateScoringRuleSchema = z.object({
  weight: z.number().int().min(0).max(5).optional(),
  isActive: z.boolean().optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
})

export type UpsertCredentialInput = z.infer<typeof UpsertCredentialSchema>
export type UpdateScoringRuleInput = z.infer<typeof UpdateScoringRuleSchema>

// ─── Regions ──────────────────────────────────────────────────────────────────

export const UF_REGEX = /^[A-Z]{2}$/

export const CreateRegionSchema = z.object({
  uf: z.string().regex(UF_REGEX, 'UF deve ter 2 letras maiúsculas'),
  name: z.string().min(2).max(100),
  capital: z.string().min(2).max(100),
  cities: z.array(z.string().min(1)).default([]),
})

export const UpdateRegionSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  capital: z.string().min(2).max(100).optional(),
  cities: z.array(z.string().min(1)).optional(),
  archived: z.boolean().optional(),
})

export type CreateRegionInput = z.infer<typeof CreateRegionSchema>
export type UpdateRegionInput = z.infer<typeof UpdateRegionSchema>

// ─── Niches ───────────────────────────────────────────────────────────────────

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const CreateNicheSchema = z.object({
  slug: z.string().regex(SLUG_REGEX, 'Slug em kebab-case (ex: pet-shop)').min(2).max(100),
  label: z.string().min(2).max(255),
  keywords: z.array(z.string().min(1)).default([]),
})

export const UpdateNicheSchema = z.object({
  label: z.string().min(2).max(255).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  archived: z.boolean().optional(),
})

export type CreateNicheInput = z.infer<typeof CreateNicheSchema>
export type UpdateNicheInput = z.infer<typeof UpdateNicheSchema>

// ─── Account Limits ───────────────────────────────────────────────────────────

export const UpdateAccountLimitsSchema = z.object({
  leadsPerMonthMax: z.number().int().min(1).max(100_000).optional(),
  maxConcurrentJobs: z.number().int().min(1).max(50).optional(),
})

export type UpdateAccountLimitsInput = z.infer<typeof UpdateAccountLimitsSchema>
