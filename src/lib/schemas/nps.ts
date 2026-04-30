import { z } from 'zod'

export const NpsSubmitSchema = z.object({
  score: z.number().int().min(0).max(10),
  comment: z
    .string()
    .max(2000, 'Comentario nao pode exceder 2000 caracteres.')
    .optional(),
})

export type NpsSubmitInput = z.infer<typeof NpsSubmitSchema>

export type NpsBucket = 'detractor' | 'passive' | 'promoter'

export function bucketFor(score: number): NpsBucket {
  if (score <= 6) return 'detractor'
  if (score <= 8) return 'passive'
  return 'promoter'
}
