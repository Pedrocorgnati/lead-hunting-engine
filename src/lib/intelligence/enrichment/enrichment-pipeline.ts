import { stageWebsitePresence } from './stage-website'
import { stageSocialPresence } from './stage-social'
import { stageReviewsRating } from './stage-reviews'
import { stageLocationAccess } from './stage-location'
import { stageBusinessMaturity } from './stage-maturity'
import { stageDigitalGap } from './stage-digital-gap'
import { detectWhatsapp } from './enrichers/whatsapp-detector'
import { detectEcommerce } from './enrichers/ecommerce-detector'
import { detectAnalyticsPixels } from './enrichers/analytics-pixels-detector'
import type { EnrichedLeadData } from './types'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

function extractSiteHtml(raw: RawLeadInput): string | null {
  const rj = (raw.rawJson ?? {}) as Record<string, unknown>
  if (typeof rj.siteHtml === 'string') return rj.siteHtml
  if (typeof rj.html === 'string') return rj.html
  return null
}

/**
 * Executa os 6 estagios de enriquecimento + 3 enrichers de sinais
 * estruturados (TASK-3 intake-review: whatsapp, ecommerce, analytics-pixels)
 * em paralelo. Cada estagio retorna score 0-100 + metadata.
 * Nunca lanca excecao.
 */
export async function enrichLead(raw: RawLeadInput): Promise<EnrichedLeadData> {
  const siteHtml = extractSiteHtml(raw)

  const [website, social, reviews, location, maturity, digitalGap] = await Promise.all([
    stageWebsitePresence(raw),
    stageSocialPresence(raw),
    stageReviewsRating(raw),
    stageLocationAccess(raw),
    stageBusinessMaturity(raw),
    stageDigitalGap(raw),
  ])

  // TASK-3 intake-review: enrichers puros (sincronos) sobre o HTML capturado
  const whatsapp = detectWhatsapp({ html: siteHtml, phone: raw.phone ?? null })
  const ecommerce = detectEcommerce({ html: siteHtml, url: raw.website ?? null })
  const pixels = detectAnalyticsPixels({ html: siteHtml })

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
    isWhatsappChannel: siteHtml ? whatsapp.isWhatsappChannel : null,
    hasEcommerce: siteHtml ? ecommerce.hasEcommerce : null,
    ecommercePlatform: ecommerce.platform ?? null,
    analyticsPixels: pixels.analyticsPixels,
    enrichmentSources,
    enrichedAt: new Date(),
  }
}
