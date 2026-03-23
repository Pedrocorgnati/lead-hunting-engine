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
})

export type SignInInput = z.infer<typeof SignInSchema>
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>
export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>
