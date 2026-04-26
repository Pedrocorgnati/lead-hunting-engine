/**
 * Schemas Zod para PitchTemplate (CRUD por usuário).
 *
 * O modelo Prisma atual é: { id, userId, name, content, tone, isFavorite }.
 * Campos `variables`, `language` e `isDefault` mencionados na spec da TASK-6
 * não existem no schema atual — mapeamos `isDefault` -> `isFavorite` por ser
 * o indicador binário já existente no banco.
 */

import { z } from 'zod'
import { TONE_OPTIONS } from '@/lib/pitch/tone-config'

export const PitchTemplateCreateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório.').max(255),
  content: z.string().min(1, 'Conteúdo é obrigatório.').max(10_000),
  tone: z.enum(TONE_OPTIONS).default('formal'),
  isFavorite: z.boolean().default(false),
})

export const PitchTemplateUpdateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    content: z.string().min(1).max(10_000).optional(),
    tone: z.enum(TONE_OPTIONS).optional(),
    isFavorite: z.boolean().optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Envie ao menos um campo para atualizar.',
  })

export const PitchTemplateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tone: z.enum(TONE_OPTIONS).optional(),
  search: z.string().optional(),
})

export type PitchTemplateCreateInput = z.infer<typeof PitchTemplateCreateSchema>
export type PitchTemplateUpdateInput = z.infer<typeof PitchTemplateUpdateSchema>
export type PitchTemplateListQuery = z.infer<typeof PitchTemplateListQuerySchema>
