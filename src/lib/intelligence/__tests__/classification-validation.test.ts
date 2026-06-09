import { classifyOpportunityWithConfig } from '../classifier/opportunity-classifier'
import { OpportunityType } from '@/lib/constants/enums'

const VALID_RULES = [
  { opportunityType: OpportunityType.A_NEEDS_SITE, minScore: 80, maxScore: 100 },
  { opportunityType: OpportunityType.B_NEEDS_SYSTEM, minScore: 65, maxScore: 79 },
  { opportunityType: OpportunityType.C_NEEDS_AUTOMATION, minScore: 50, maxScore: 64 },
  { opportunityType: OpportunityType.D_NEEDS_ECOMMERCE, minScore: 35, maxScore: 49 },
  { opportunityType: OpportunityType.E_SCALE, minScore: 0, maxScore: 34 },
]

function validateRules(rules: typeof VALID_RULES) {
  const sorted = [...rules].sort((a, b) => b.minScore - a.minScore)
  const expectedOrder = [
    OpportunityType.A_NEEDS_SITE,
    OpportunityType.B_NEEDS_SYSTEM,
    OpportunityType.C_NEEDS_AUTOMATION,
    OpportunityType.D_NEEDS_ECOMMERCE,
    OpportunityType.E_SCALE,
  ]
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].opportunityType !== expectedOrder[i]) {
      return 'Ordem invalida'
    }
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].minScore <= sorted[i + 1].maxScore) {
      return 'Overlap'
    }
  }
  if (sorted[0].minScore <= 0) return 'A minScore invalido'
  if (sorted[sorted.length - 1].maxScore < 0) return 'E maxScore invalido'
  return null
}

describe('classification-validation', () => {
  it('deve aceitar regras validas', () => {
    expect(validateRules(VALID_RULES)).toBeNull()
  })

  it('deve rejeitar overlap entre faixas adjacentes', () => {
    const invalid = [
      { opportunityType: OpportunityType.A_NEEDS_SITE, minScore: 70, maxScore: 100 },
      { opportunityType: OpportunityType.B_NEEDS_SYSTEM, minScore: 65, maxScore: 79 },
      ...VALID_RULES.slice(2),
    ]
    expect(validateRules(invalid)).toBe('Overlap')
  })

  it('deve rejeitar ordem invertida', () => {
    const invalid = [
      { opportunityType: OpportunityType.E_SCALE, minScore: 80, maxScore: 100 },
      { opportunityType: OpportunityType.D_NEEDS_ECOMMERCE, minScore: 65, maxScore: 79 },
      { opportunityType: OpportunityType.C_NEEDS_AUTOMATION, minScore: 50, maxScore: 64 },
      { opportunityType: OpportunityType.B_NEEDS_SYSTEM, minScore: 35, maxScore: 49 },
      { opportunityType: OpportunityType.A_NEEDS_SITE, minScore: 0, maxScore: 34 },
    ]
    expect(validateRules(invalid)).toBe('Ordem invalida')
  })

  it('deve aceitar faixa A com minScore > 0 sem overlap', () => {
    const rules = [
      { opportunityType: OpportunityType.A_NEEDS_SITE, minScore: 81, maxScore: 100 },
      { opportunityType: OpportunityType.B_NEEDS_SYSTEM, minScore: 61, maxScore: 80 },
      { opportunityType: OpportunityType.C_NEEDS_AUTOMATION, minScore: 41, maxScore: 60 },
      { opportunityType: OpportunityType.D_NEEDS_ECOMMERCE, minScore: 21, maxScore: 40 },
      { opportunityType: OpportunityType.E_SCALE, minScore: 0, maxScore: 20 },
    ]
    expect(validateRules(rules)).toBeNull()
  })

  it('deve aceitar faixa E com maxScore alto sem overlap', () => {
    const rules = [
      { opportunityType: OpportunityType.A_NEEDS_SITE, minScore: 91, maxScore: 100 },
      { opportunityType: OpportunityType.B_NEEDS_SYSTEM, minScore: 71, maxScore: 90 },
      { opportunityType: OpportunityType.C_NEEDS_AUTOMATION, minScore: 51, maxScore: 70 },
      { opportunityType: OpportunityType.D_NEEDS_ECOMMERCE, minScore: 31, maxScore: 50 },
      { opportunityType: OpportunityType.E_SCALE, minScore: 0, maxScore: 30 },
    ]
    expect(validateRules(rules)).toBeNull()
  })

  it('deve classificar corretamente com config customizada', () => {
    const result = classifyOpportunityWithConfig(
      { businessMaturity: 70, digitalGap: 70 } as never,
      { scores: { businessMaturity: 70, digitalGap: 70 } } as never,
      undefined,
      VALID_RULES
    )
    expect(result).toBe(OpportunityType.B_NEEDS_SYSTEM)
  })

  it('deve classificar A quando score >= 80', () => {
    const result = classifyOpportunityWithConfig(
      { businessMaturity: 90, digitalGap: 90 } as never,
      { scores: { businessMaturity: 90, digitalGap: 90 } } as never,
      undefined,
      VALID_RULES
    )
    expect(result).toBe(OpportunityType.A_NEEDS_SITE)
  })
})
