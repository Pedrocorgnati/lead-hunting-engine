import type { EnrichmentStageResult } from './types'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

export async function stageSocialPresence(raw: RawLeadInput): Promise<EnrichmentStageResult> {
  try {
    let score = 0
    const metadata: Record<string, unknown> = {}
    const rawData = (raw.rawJson ?? {}) as Record<string, unknown>

    // +30: Google My Business ativo (tem place_id e rating)
    if (rawData.place_id && rawData.rating) {
      score += 30
      metadata.hasGoogleMyBusiness = true
    }

    // +20: link social no website
    if (raw.website) {
      const site = raw.website.toLowerCase()
      if (site.includes('instagram') || site.includes('facebook') || site.includes('fb.com')) {
        score += 20
        metadata.hasSocialLink = true
      }
    }

    // +20: categoria B2C (negócios B2C tendem a ter mais social)
    const b2cCategories = ['restaurant', 'cafe', 'salon', 'spa', 'gym', 'store']
    if (b2cCategories.some(cat => raw.category?.toLowerCase().includes(cat))) {
      score += 20
      metadata.isB2C = true
    }

    // +30: reviews significativas no Google (presença digital básica)
    if ((raw.reviewCount ?? 0) > 10) {
      score += 30
      metadata.hasSignificantReviews = true
    }

    return { score: Math.min(score, 100), sources: ['raw_lead_data'], metadata }
  } catch {
    return { score: 0, sources: [], metadata: { error: 'stage-social-failed' } }
  }
}
