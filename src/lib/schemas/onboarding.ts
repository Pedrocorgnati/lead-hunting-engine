import { z } from 'zod'

/**
 * Schemas Zod para o wizard de onboarding (TASK-8).
 * Cada step tem um schema próprio; onboardingDataSchema é parcial pois o usuário
 * pode retomar em qualquer passo.
 */

export const TOTAL_ONBOARDING_STEPS = 5

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

export const onboardingDataSchema = z
  .object({
    companyProfile: companyProfileSchema.optional(),
    niches: nichesSchema.shape.niches.optional(),
    regions: regionsSchema.shape.regions.optional(),
    integrations: integrationsSchema.optional(),
  })
  .strict()

export const onboardingProgressPatchSchema = z.object({
  step: z.number().int().min(0).max(TOTAL_ONBOARDING_STEPS),
  data: onboardingDataSchema.optional(),
})

export type CompanyProfile = z.infer<typeof companyProfileSchema>
export type OnboardingData = z.infer<typeof onboardingDataSchema>
export type OnboardingProgressPatch = z.infer<typeof onboardingProgressPatchSchema>
