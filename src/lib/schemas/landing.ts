import { z } from 'zod'

/**
 * TASK-2/ST002 intake-review (CL-307, CL-325): validacoes Zod dos
 * formularios publicos da landing.
 */

const BusinessTypeEnum = z.enum(['AGENCIA', 'CONSULTORIA', 'SDR', 'FREELA', 'OUTRO'])

// Honeypot (CL-315, CL-326) e time-to-fill sao verificados no handler,
// mas `_gotcha` aceita string vazia no Zod.
const honeypotField = z.string().max(0).optional().or(z.literal(''))

export const waitlistSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email e obrigatorio')
    .email('Email invalido')
    .max(255),
  name: z.string().trim().min(1, 'Nome e obrigatorio').max(255).optional(),
  businessType: BusinessTypeEnum.optional(),
  consentLgpd: z
    .boolean()
    .refine((v) => v === true, 'Aceite a politica LGPD para continuar'),
  // campos anti-spam
  _gotcha: honeypotField,
})

export type WaitlistInput = z.infer<typeof waitlistSchema>

export const contactSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email e obrigatorio')
    .email('Email invalido')
    .max(255),
  name: z.string().trim().min(1, 'Nome e obrigatorio').max(255),
  subject: z.string().trim().min(3, 'Assunto muito curto').max(255),
  message: z.string().trim().min(10, 'Mensagem muito curta').max(2000),
  consentLgpd: z
    .boolean()
    .refine((v) => v === true, 'Aceite a politica LGPD para continuar'),
  _gotcha: honeypotField,
})

export type ContactInput = z.infer<typeof contactSchema>

export const waitlistInviteSchema = z.object({
  note: z.string().trim().max(500).optional(),
})

export const contactReplySchema = z.object({
  replyContent: z.string().trim().min(5, 'Resposta muito curta').max(5000),
})

export const consentSchema = z.object({
  version: z.string().trim().min(1).max(20),
  categories: z
    .array(z.enum(['necessary', 'analytics', 'marketing']))
    .min(1, 'Selecione ao menos uma categoria'),
})

export type ConsentInput = z.infer<typeof consentSchema>
