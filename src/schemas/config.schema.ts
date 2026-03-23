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
