import { z } from 'zod'

export const UpdateProfileSchema = z
  .object({
    name: z.string().min(2, 'Mínimo 2 caracteres').max(100).trim().optional(),
    avatarUrl: z.string().url().nullable().optional(),
  })
  .strict()

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
