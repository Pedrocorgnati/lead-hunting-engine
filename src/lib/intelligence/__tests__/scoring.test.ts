jest.mock('@/lib/prisma', () => ({
  getPrisma: jest.fn().mockReturnValue({
    scoringRule: {
      findMany: jest.fn(),
    },
  }),
}))

import { classifyOpportunity } from '../classifier/opportunity-classifier'
import { calculateScore, scoreRawSignals } from '../scoring/scoring-engine'
import { OpportunityType } from '@/lib/constants/enums'
import type { ScoreResult } from '../scoring/scoring-engine'
import type { EnrichedLeadData } from '../enrichment/types'

function getMockedPrisma() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return jest.requireMock('@/lib/prisma').getPrisma() as {
    scoringRule: { findMany: jest.Mock }
  }
}

const baseScores = {
  websitePresence: 50, socialPresence: 50, reviewsRating: 50,
  locationAccess: 50, businessMaturity: 50, digitalGap: 50,
}

const baseBreakdown: ScoreResult['breakdown'] = {}

const baseEnriched: EnrichedLeadData = {
  name: 'Test Lead', address: null, city: null, state: null,
  phone: null, website: null, category: null, lat: null, lng: null, rating: null,
  scores: baseScores, enrichmentSources: [], enrichedAt: new Date(),
}

describe('classifyOpportunity', () => {
  it('[SUCCESS] classifica A_NEEDS_SITE quando businessMaturity e digitalGap são altos', () => {
    const enriched: EnrichedLeadData = { ...baseEnriched, scores: { ...baseScores, businessMaturity: 85, digitalGap: 90 } }
    const result = classifyOpportunity({ totalScore: 80, breakdown: baseBreakdown }, enriched)
    expect(result).toBe(OpportunityType.A_NEEDS_SITE)
  })

  it('[SUCCESS] classifica E_SCALE quando negócio já tem tudo digital (gap baixo)', () => {
    const enriched: EnrichedLeadData = { ...baseEnriched, scores: { ...baseScores, businessMaturity: 20, digitalGap: 10 } }
    const result = classifyOpportunity({ totalScore: 20, breakdown: baseBreakdown }, enriched)
    expect(result).toBe(OpportunityType.E_SCALE)
  })

  it('[SUCCESS] classifica C_NEEDS_AUTOMATION para negócio médio sem site', () => {
    const enriched: EnrichedLeadData = { ...baseEnriched, scores: { ...baseScores, businessMaturity: 55, digitalGap: 60 } }
    const result = classifyOpportunity({ totalScore: 57, breakdown: baseBreakdown }, enriched)
    expect(result).toBe(OpportunityType.C_NEEDS_AUTOMATION)
  })

  it('[EDGE] todos os scores zero resulta em E_SCALE', () => {
    const enriched: EnrichedLeadData = { ...baseEnriched, scores: { ...baseScores, businessMaturity: 0, digitalGap: 0 } }
    const result = classifyOpportunity({ totalScore: 0, breakdown: baseBreakdown }, enriched)
    expect(result).toBe(OpportunityType.E_SCALE)
  })
})

describe('calculateScore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('[SUCCESS] calcula score com pesos iguais (fallback quando DB vazio)', async () => {
    getMockedPrisma().scoringRule.findMany.mockResolvedValue([])

    const enriched: EnrichedLeadData = {
      ...baseEnriched,
      scores: { websitePresence: 80, socialPresence: 60, reviewsRating: 70, locationAccess: 50, businessMaturity: 90, digitalGap: 40 },
    }

    const result = await calculateScore(enriched)

    expect(result.totalScore).toBeGreaterThan(0)
    expect(result.totalScore).toBeLessThanOrEqual(100)
    expect(Object.keys(result.breakdown)).toHaveLength(6)
    // Com pesos iguais (16.67 cada), todas as dimensões contribuem igualmente
    const weights = Object.values(result.breakdown).map(b => b.weight)
    expect(new Set(weights).size).toBe(1) // todos iguais
  })

  it('[SUCCESS] calcula score com pesos do DB configurados', async () => {
    getMockedPrisma().scoringRule.findMany.mockResolvedValue([
      { slug: 'website_presence', weight: 30 },
      { slug: 'social_presence', weight: 10 },
      { slug: 'reviews_rating', weight: 10 },
      { slug: 'location_access', weight: 10 },
      { slug: 'business_maturity', weight: 20 },
      { slug: 'digital_gap', weight: 20 },
    ])

    const enriched: EnrichedLeadData = {
      ...baseEnriched,
      scores: { websitePresence: 100, socialPresence: 0, reviewsRating: 0, locationAccess: 0, businessMaturity: 0, digitalGap: 0 },
    }

    const result = await calculateScore(enriched)

    // website_presence peso 30, score 100 → weighted = 30
    expect(result.breakdown['website_presence'].weighted).toBe(30)
    expect(result.totalScore).toBe(30)
  })

  it('[SUCCESS] score é determinístico para mesmos inputs', async () => {
    getMockedPrisma().scoringRule.findMany.mockResolvedValue([])

    const enriched: EnrichedLeadData = {
      ...baseEnriched,
      scores: { websitePresence: 75, socialPresence: 45, reviewsRating: 60, locationAccess: 80, businessMaturity: 55, digitalGap: 90 },
    }

    const result1 = await calculateScore(enriched)
    const result2 = await calculateScore(enriched)

    expect(result1.totalScore).toBe(result2.totalScore)
  })

  it('[EDGE] breakdown contém todas as 6 dimensões', async () => {
    getMockedPrisma().scoringRule.findMany.mockResolvedValue([])

    const result = await calculateScore(baseEnriched)

    const expectedDimensions = ['website_presence', 'social_presence', 'reviews_rating', 'location_access', 'business_maturity', 'digital_gap']
    for (const dim of expectedDimensions) {
      expect(result.breakdown[dim]).toBeDefined()
      expect(result.breakdown[dim]).toHaveProperty('score')
      expect(result.breakdown[dim]).toHaveProperty('weight')
      expect(result.breakdown[dim]).toHaveProperty('weighted')
    }
  })

  it('[EDGE] peso 0 em uma dimensão resulta em weighted 0', async () => {
    getMockedPrisma().scoringRule.findMany.mockResolvedValue([
      { slug: 'website_presence', weight: 0 },
      { slug: 'social_presence', weight: 50 },
      { slug: 'reviews_rating', weight: 50 },
      { slug: 'location_access', weight: 0 },
      { slug: 'business_maturity', weight: 0 },
      { slug: 'digital_gap', weight: 0 },
    ])

    const enriched: EnrichedLeadData = {
      ...baseEnriched,
      scores: { websitePresence: 100, socialPresence: 80, reviewsRating: 60, locationAccess: 100, businessMaturity: 100, digitalGap: 100 },
    }

    const result = await calculateScore(enriched)

    expect(result.breakdown['website_presence'].weighted).toBe(0)
    expect(result.breakdown['location_access'].weighted).toBe(0)
    expect(result.breakdown['social_presence'].weighted).toBe(40) // 80 * 50 / 100
    expect(result.breakdown['reviews_rating'].weighted).toBe(30)  // 60 * 50 / 100
  })

  it('[ERROR] DB falha → fallback para pesos iguais', async () => {
    getMockedPrisma().scoringRule.findMany.mockRejectedValue(new Error('DB timeout'))

    const result = await calculateScore(baseEnriched)

    expect(result.totalScore).toBeGreaterThanOrEqual(0)
    // Fallback: pesos iguais como se DB estivesse vazio
    const weights = Object.values(result.breakdown).map(b => b.weight)
    expect(new Set(weights).size).toBe(1)
  })
})

describe('scoreRawSignals', () => {
  it('scores +2 for IG >=10k with broken site', () => {
    const result = scoreRawSignals({ instagramFollowers: 15000, siteReachable: false })
    expect(result.breakdown.instagram_active_weak_site).toBe(2)
    expect(result.bonus).toBe(2)
  })

  it('no bonus for IG >=10k with working site', () => {
    const result = scoreRawSignals({ instagramFollowers: 15000, siteReachable: true })
    expect(result.breakdown.instagram_active_weak_site).toBeUndefined()
    expect(result.bonus).toBe(0)
  })

  it('no bonus for IG <10k with broken site', () => {
    const result = scoreRawSignals({ instagramFollowers: 500, siteReachable: false })
    expect(result.bonus).toBe(0)
  })

  it('returns empty breakdown when no signals', () => {
    const result = scoreRawSignals({ instagramFollowers: null, siteReachable: null })
    expect(result.bonus).toBe(0)
    expect(Object.keys(result.breakdown)).toHaveLength(0)
  })
})

describe('classifyOpportunity — social signals', () => {
  it('overrides to A_NEEDS_SITE when FB abandoned and site unreachable', () => {
    const enriched: EnrichedLeadData = {
      ...baseEnriched,
      scores: { ...baseScores, businessMaturity: 10, digitalGap: 10 },
    }
    const result = classifyOpportunity(
      { totalScore: 10, breakdown: baseBreakdown },
      enriched,
      { facebookAbandoned: true, siteReachable: false },
    )
    expect(result).toBe(OpportunityType.A_NEEDS_SITE)
  })

  it('does not override when site is reachable (even if FB abandoned)', () => {
    const enriched: EnrichedLeadData = {
      ...baseEnriched,
      scores: { ...baseScores, businessMaturity: 10, digitalGap: 10 },
    }
    const result = classifyOpportunity(
      { totalScore: 10, breakdown: baseBreakdown },
      enriched,
      { facebookAbandoned: true, siteReachable: true },
    )
    expect(result).toBe(OpportunityType.E_SCALE)
  })
})
