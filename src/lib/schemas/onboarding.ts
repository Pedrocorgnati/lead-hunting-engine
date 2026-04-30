import { z } from 'zod'
import type { UserRole } from '@/lib/constants/enums'

/**
 * Schemas Zod para o wizard de onboarding (TASK-1 + TASK-4 role-based).
 *
 * Promessa BUDGET.md entrega 7: 5 etapas para ADMIN, 3 etapas para OPERATOR.
 * Cada step tem schema próprio; onboardingDataSchema é parcial pois o
 * usuário pode retomar em qualquer passo e (para OPERATOR) pular conteúdo
 * informativo.
 */

export const ADMIN_ONBOARDING_STEPS = 5
export const OPERATOR_ONBOARDING_STEPS = 3

/**
 * Mantido para compatibilidade com chamadas antigas. Quem precisa do total
 * correto por usuário deve consumir `getTotalOnboardingSteps(role)`.
 */
export const TOTAL_ONBOARDING_STEPS = ADMIN_ONBOARDING_STEPS

export function getTotalOnboardingSteps(role: UserRole): number {
  return role === 'OPERATOR' ? OPERATOR_ONBOARDING_STEPS : ADMIN_ONBOARDING_STEPS
}

export const companyTypeEnum = z.enum(['B2B', 'B2C', 'B2B2C'])

export const companyProfileSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, 'Informe o nome da empresa.')
    .max(160, 'Máximo de 160 caracteres.'),
  companyType: companyTypeEnum,
  cnpj: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^\d{14}$/.test(v.replace(/\D/g, '')),
      'CNPJ deve conter 14 dígitos.'
    ),
})

export const nichesSchema = z.object({
  niches: z
    .array(z.string().min(1))
    .min(1, 'Selecione ao menos um nicho.')
    .max(20, 'Máximo de 20 nichos.'),
})

export const regionsSchema = z.object({
  regions: z
    .array(
      z.object({
        uf: z.string().length(2, 'UF inválida.'),
        cities: z.array(z.string().min(1)).default([]),
      })
    )
    .min(1, 'Selecione ao menos uma região.')
    .max(27, 'Máximo de 27 UFs.'),
})

export const integrationsSchema = z.object({
  integrations: z
    .array(
      z.object({
        provider: z.string().min(1),
        configured: z.boolean().default(false),
      })
    )
    .default([]),
  skipped: z.boolean().default(false),
})

export const operatorTourCompletedSchema = z.object({
  coletas: z.boolean().default(false),
  leads: z.boolean().default(false),
})

export const onboardingDataSchema = z
  .object({
    companyProfile: companyProfileSchema.optional(),
    niches: nichesSchema.shape.niches.optional(),
    regions: regionsSchema.shape.regions.optional(),
    integrations: integrationsSchema.optional(),
    operatorTourCompleted: operatorTourCompletedSchema.optional(),
  })
  .strict()

/**
 * Schema do PATCH /api/v1/onboarding/progress.
 * Aceita step até o máximo entre os roles (ADMIN_ONBOARDING_STEPS).
 * Validação por role-aware (step <= getTotalOnboardingSteps(role)) acontece
 * no route handler após `requireAuth`, pois aqui não conhecemos o role.
 */
export const onboardingProgressPatchSchema = z.object({
  step: z.number().int().min(0).max(ADMIN_ONBOARDING_STEPS),
  data: onboardingDataSchema.optional(),
})

export type CompanyProfile = z.infer<typeof companyProfileSchema>
export type OperatorTourCompleted = z.infer<typeof operatorTourCompletedSchema>
export type OnboardingData = z.infer<typeof onboardingDataSchema>
export type OnboardingProgressPatch = z.infer<typeof onboardingProgressPatchSchema>
