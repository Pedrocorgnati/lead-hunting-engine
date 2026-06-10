import { z } from 'zod'

export const SignInSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
})

export const ResetPasswordSchema = z.object({
  email: z.string().email('Email inválido'),
})

export const UpdatePasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[a-zA-Z]/, 'Deve conter pelo menos uma letra')
    .regex(/[0-9]/, 'Deve conter pelo menos um número'),
  // Reauth (item 038): obrigatoria na troca voluntaria; o servidor dispensa
  // apenas no fluxo de reset forcado (must_reset_password).
  currentPassword: z.string().min(1).max(200).optional(),
})

export type SignInInput = z.infer<typeof SignInSchema>
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>
export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>
