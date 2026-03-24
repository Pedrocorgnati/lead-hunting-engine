/**
 * Schemas Zod para credenciais de API.
 * Re-exporta do config.schema.ts e adiciona schema de criação com provider.
 */

import { z } from 'zod'
import { CredentialProvider } from '@/lib/constants/enums'

export { UpsertCredentialSchema, type UpsertCredentialInput } from '@/schemas/config.schema'

export const createCredentialSchema = z.object({
  label: z.string().min(1, 'Rótulo é obrigatório.').max(100),
  provider: z.nativeEnum(CredentialProvider),
  apiKey: z.string().min(1, 'Chave de API é obrigatória.'),
})

export const updateCredentialSchema = z.object({
  label: z.string().min(1, 'Rótulo é obrigatório.').max(100),
  apiKey: z.string().optional(),
})

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>
export type UpdateCredentialInput = z.infer<typeof updateCredentialSchema>
