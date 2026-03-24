import type { EnrichmentStageResult } from './types'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

export async function stageReviewsRating(raw: RawLeadInput): Promise<EnrichmentStageResult> {
  try {
    let score = 0
    const metadata: Record<string, unknown> = {}
    const rating = raw.rating ?? 0
    const reviews = raw.reviewCount ?? 0

    // Score baseado na avaliação (0-5 → 0-50)
    score += Math.round((rating / 5) * 50)
    metadata.rating = rating

    // Score baseado no volume de reviews (0-50)
    if (reviews >= 100) score += 50
    else if (reviews >= 50) score += 35
    else if (reviews >= 10) score += 20
    else if (reviews >= 1) score += 10
    metadata.reviewCount = reviews

    return { score: Math.min(score, 100), sources: ['google-places'], metadata }
  } catch {
    return { score: 50, sources: [], metadata: { error: 'stage-reviews-failed' } }
  }
}
