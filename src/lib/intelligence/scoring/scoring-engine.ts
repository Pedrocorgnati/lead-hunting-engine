import { getPrisma } from '@/lib/prisma'
import type { EnrichedLeadData } from '../enrichment/types'

export interface ScoreResult {
  totalScore: number               // 0-100 ponderado
  breakdown: Record<string, { score: number; weight: number; weighted: number }>
}

// Mapeamento entre slugs do DB (snake_case) e chaves do EnrichedLeadData (camelCase)
const DIMENSION_MAP: Record<string, keyof EnrichedLeadData['scores']> = {
  'website_presence': 'websitePresence',
  'social_presence':  'socialPresence',
  'reviews_rating':   'reviewsRating',
  'location_access':  'locationAccess',
  'business_maturity':'businessMaturity',
  'digital_gap':      'digitalGap',
}

export async function calculateScore(enriched: EnrichedLeadData): Promise<ScoreResult> {
  const prisma = getPrisma()
  let rules: Array<{ slug: string; weight: number }> = []

  try {
    rules = await prisma.scoringRule.findMany({
      where: { isActive: true },
      select: { slug: true, weight: true },
    })
  } catch {
    rules = []
  }

  // Fallback: pesos iguais se não configurados (banco vazio ou erro)
  const weights: Record<string, number> = {}
  if (rules.length === 0) {
    const equalWeight = 100 / Object.keys(DIMENSION_MAP).length
    Object.keys(DIMENSION_MAP).forEach(dim => { weights[dim] = equalWeight })
  } else {
    rules.forEach(r => { weights[r.slug] = r.weight })
  }

  let totalWeighted = 0
  let totalWeight = 0
  const breakdown: ScoreResult['breakdown'] = {}

  for (const [dimension, scoreKey] of Object.entries(DIMENSION_MAP)) {
    const score = enriched.scores[scoreKey]
    const weight = weights[dimension] ?? 0
    const weighted = weight > 0 ? (score * weight) / 100 : 0

    breakdown[dimension] = { score, weight, weighted }
    totalWeighted += weighted
    totalWeight += weight
  }

  const totalScore = totalWeight > 0 ? Math.round(totalWeighted) : 0

  return { totalScore, breakdown }
}
