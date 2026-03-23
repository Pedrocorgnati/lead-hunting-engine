import { z } from 'zod'

export const CreateInviteSchema = z.object({
  email: z.string().email('Email inválido'),
  role: z.enum(['ADMIN', 'OPERATOR']).default('OPERATOR'),
  expiresInDays: z.number().int().min(1).max(30).default(7),
})

export const ActivateAccountSchema = z.object({
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[a-zA-Z]/, 'Deve conter pelo menos uma letra')
    .regex(/[0-9]/, 'Deve conter pelo menos um número'),
  termsAccepted: z.literal(true, {
    error: 'Você deve aceitar os Termos de Uso e a Política de Privacidade',
  }),
})

export type CreateInviteInput = z.infer<typeof CreateInviteSchema>
export type ActivateAccountInput = z.infer<typeof ActivateAccountSchema>
