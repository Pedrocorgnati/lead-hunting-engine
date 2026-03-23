import { z } from 'zod'

export const UpdateProfileSchema = z
  .object({
    name: z.string().min(1).max(255).trim().optional(),
    avatarUrl: z.string().url().nullable().optional(),
  })
  .strict()

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
