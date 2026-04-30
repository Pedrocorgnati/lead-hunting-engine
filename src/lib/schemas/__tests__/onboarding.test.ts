/**
 * Unit tests — Schemas de onboarding (M7-G02 / TASK-5).
 *
 * Cobertura:
 *   - getTotalOnboardingSteps role-aware (ADMIN=5, OPERATOR=3) — TASK-4.
 *   - Validação Zod dos schemas de step (companyProfile, niches, regions, integrations).
 *   - operatorTourCompleted (novo schema TASK-4).
 *   - onboardingProgressPatchSchema boundaries (step min/max).
 */

import {
  ADMIN_ONBOARDING_STEPS,
  OPERATOR_ONBOARDING_STEPS,
  TOTAL_ONBOARDING_STEPS,
  getTotalOnboardingSteps,
  companyProfileSchema,
  nichesSchema,
  regionsSchema,
  operatorTourCompletedSchema,
  onboardingDataSchema,
  onboardingProgressPatchSchema,
} from '../onboarding'
import { UserRole } from '@/lib/constants/enums'

describe('getTotalOnboardingSteps (TASK-4 role-aware)', () => {
  it('retorna 5 para ADMIN', () => {
    expect(getTotalOnboardingSteps(UserRole.ADMIN)).toBe(ADMIN_ONBOARDING_STEPS)
    expect(getTotalOnboardingSteps(UserRole.ADMIN)).toBe(5)
  })

  it('retorna 3 para OPERATOR', () => {
    expect(getTotalOnboardingSteps(UserRole.OPERATOR)).toBe(OPERATOR_ONBOARDING_STEPS)
    expect(getTotalOnboardingSteps(UserRole.OPERATOR)).toBe(3)
  })

  it('TOTAL_ONBOARDING_STEPS legacy = ADMIN_ONBOARDING_STEPS (compat)', () => {
    expect(TOTAL_ONBOARDING_STEPS).toBe(ADMIN_ONBOARDING_STEPS)
  })
})

describe('companyProfileSchema', () => {
  it('aceita payload válido com CNPJ formatado', () => {
    const result = companyProfileSchema.safeParse({
      companyName: 'Acme Corp',
      companyType: 'B2B',
      cnpj: '12.345.678/0001-95',
    })
    expect(result.success).toBe(true)
  })

  it('aceita payload sem CNPJ (opcional)', () => {
    const result = companyProfileSchema.safeParse({
      companyName: 'Acme',
      companyType: 'B2C',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita companyName muito curto', () => {
    const result = companyProfileSchema.safeParse({
      companyName: 'A',
      companyType: 'B2B',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita companyType inválido', () => {
    const result = companyProfileSchema.safeParse({
      companyName: 'Acme',
      companyType: 'INVALID',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita CNPJ com menos de 14 dígitos', () => {
    const result = companyProfileSchema.safeParse({
      companyName: 'Acme',
      companyType: 'B2B',
      cnpj: '123',
    })
    expect(result.success).toBe(false)
  })
})

describe('nichesSchema', () => {
  it('aceita lista válida', () => {
    expect(nichesSchema.safeParse({ niches: ['saude', 'tecnologia'] }).success).toBe(true)
  })

  it('rejeita lista vazia', () => {
    expect(nichesSchema.safeParse({ niches: [] }).success).toBe(false)
  })

  it('rejeita mais de 20 nichos', () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `niche-${i}`)
    expect(nichesSchema.safeParse({ niches: tooMany }).success).toBe(false)
  })
})

describe('regionsSchema', () => {
  it('aceita uma região com cidades', () => {
    expect(
      regionsSchema.safeParse({
        regions: [{ uf: 'SP', cities: ['São Paulo'] }],
      }).success,
    ).toBe(true)
  })

  it('rejeita UF inválido', () => {
    expect(
      regionsSchema.safeParse({
        regions: [{ uf: 'XYZ', cities: [] }],
      }).success,
    ).toBe(false)
  })

  it('rejeita lista vazia', () => {
    expect(regionsSchema.safeParse({ regions: [] }).success).toBe(false)
  })
})

describe('operatorTourCompletedSchema (TASK-4)', () => {
  it('aplica defaults false para campos ausentes', () => {
    const result = operatorTourCompletedSchema.parse({})
    expect(result).toEqual({ coletas: false, leads: false })
  })

  it('aceita ambos true', () => {
    const result = operatorTourCompletedSchema.parse({ coletas: true, leads: true })
    expect(result.coletas).toBe(true)
    expect(result.leads).toBe(true)
  })
})

describe('onboardingDataSchema', () => {
  it('aceita objeto vazio (todos opcionais)', () => {
    expect(onboardingDataSchema.safeParse({}).success).toBe(true)
  })

  it('aceita combinação completa de campos', () => {
    const result = onboardingDataSchema.safeParse({
      companyProfile: { companyName: 'Acme', companyType: 'B2B' },
      niches: ['saude'],
      regions: [{ uf: 'SP', cities: ['São Paulo'] }],
      integrations: { integrations: [], skipped: true },
      operatorTourCompleted: { coletas: true, leads: false },
    })
    expect(result.success).toBe(true)
  })

  it('rejeita chave desconhecida (strict)', () => {
    const result = onboardingDataSchema.safeParse({ desconhecido: 'valor' })
    expect(result.success).toBe(false)
  })
})

describe('onboardingProgressPatchSchema', () => {
  it('aceita step válido sem data', () => {
    expect(onboardingProgressPatchSchema.safeParse({ step: 0 }).success).toBe(true)
    expect(onboardingProgressPatchSchema.safeParse({ step: 5 }).success).toBe(true)
  })

  it('rejeita step negativo', () => {
    expect(onboardingProgressPatchSchema.safeParse({ step: -1 }).success).toBe(false)
  })

  it('rejeita step > ADMIN_ONBOARDING_STEPS', () => {
    expect(onboardingProgressPatchSchema.safeParse({ step: 6 }).success).toBe(false)
  })

  it('rejeita step não inteiro', () => {
    expect(onboardingProgressPatchSchema.safeParse({ step: 1.5 }).success).toBe(false)
  })

  it('aceita step + data válido', () => {
    const result = onboardingProgressPatchSchema.safeParse({
      step: 2,
      data: { niches: ['tecnologia'] },
    })
    expect(result.success).toBe(true)
  })
})
