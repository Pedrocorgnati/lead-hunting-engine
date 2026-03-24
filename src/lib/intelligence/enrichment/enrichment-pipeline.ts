import { stageWebsitePresence } from './stage-website'
import { stageSocialPresence } from './stage-social'
import { stageReviewsRating } from './stage-reviews'
import { stageLocationAccess } from './stage-location'
import { stageBusinessMaturity } from './stage-maturity'
import { stageDigitalGap } from './stage-digital-gap'
import type { EnrichedLeadData } from './types'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

/**
 * Executa os 6 estágios de enriquecimento em paralelo.
 * Cada estágio retorna score 0-100 + metadata. Nunca lança exceção.
 */
export async function enrichLead(raw: RawLeadInput): Promise<EnrichedLeadData> {
  const [website, social, reviews, location, maturity, digitalGap] = await Promise.all([
    stageWebsitePresence(raw),
    stageSocialPresence(raw),
    stageReviewsRating(raw),
    stageLocationAccess(raw),
    stageBusinessMaturity(raw),
    stageDigitalGap(raw),
  ])

  const enrichmentSources = [...new Set([
    ...website.sources,
    ...social.sources,
    ...reviews.sources,
    ...location.sources,
    ...maturity.sources,
    ...digitalGap.sources,
  ])]

  return {
    name: raw.name,
    address: raw.address ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    phone: raw.phone ?? null,
    website: raw.website ?? null,
    category: raw.category ?? null,
    lat: raw.lat ?? null,
    lng: raw.lng ?? null,
    rating: raw.rating ?? null,
    scores: {
      websitePresence: website.score,
      socialPresence: social.score,
      reviewsRating: reviews.score,
      locationAccess: location.score,
      businessMaturity: maturity.score,
      digitalGap: digitalGap.score,
    },
    enrichmentSources,
    enrichedAt: new Date(),
  }
}
