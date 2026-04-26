import type { EnrichmentStageResult } from './types'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'
import { evaluateFacebookAbandonment } from '@/lib/intelligence/heuristics/facebook-abandonment'

const IG_ACTIVE_FOLLOWERS_THRESHOLD = 10_000

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

    // +20: categoria B2C
    const b2cCategories = ['restaurant', 'cafe', 'salon', 'spa', 'gym', 'store']
    if (b2cCategories.some(cat => raw.category?.toLowerCase().includes(cat))) {
      score += 20
      metadata.isB2C = true
    }

    // +30: reviews significativas no Google
    if ((raw.reviewCount ?? 0) > 10) {
      score += 30
      metadata.hasSignificantReviews = true
    }

    // IG: +10 se tem seguidores, +extra 10 se >= 10k
    if ((raw.instagramFollowers ?? 0) > 0) {
      score = Math.min(score + 10, 100)
      metadata.hasInstagram = true
      if ((raw.instagramFollowers ?? 0) >= IG_ACTIVE_FOLLOWERS_THRESHOLD) {
        score = Math.min(score + 10, 100)
        metadata.instagramActive = true
      }
    }

    // IG ativo com site fraco/ausente: sinal critico para oportunidade
    if (
      (raw.instagramFollowers ?? 0) >= IG_ACTIVE_FOLLOWERS_THRESHOLD &&
      raw.siteReachable === false
    ) {
      metadata.instagram_active_weak_site = true
    }

    // FB: +10 se seguidores > 0
    if ((raw.facebookFollowers ?? 0) > 0) {
      score = Math.min(score + 10, 100)
      metadata.hasFacebook = true
    }

    // FB abandonado: heuristica centralizada (lastPostAt >= 90d OU engagement baixo)
    const fbSignal =
      (raw.facebookFollowers ?? 0) > 0 ||
      raw.facebookLastPostAt ||
      raw.facebookEngagementRate != null ||
      raw.facebookAbandoned
    if (fbSignal) {
      const abandonment = evaluateFacebookAbandonment({
        lastPostAt: raw.facebookLastPostAt ?? null,
        followers: raw.facebookFollowers ?? null,
        engagementRate: raw.facebookEngagementRate ?? null,
      })
      const abandoned = raw.facebookAbandoned === true || abandonment.abandoned
      if (abandoned) {
        metadata.facebookAbandoned = true
        metadata.facebookAbandonmentReasons = abandonment.reasons
      }
      if (abandonment.daysSinceLastPost !== null) {
        metadata.facebookDaysSinceLastPost = abandonment.daysSinceLastPost
      }
    }

    if (raw.facebookEngagementRate !== undefined && raw.facebookEngagementRate !== null) {
      metadata.facebookEngagementRate = raw.facebookEngagementRate
    }

    return { score: Math.min(score, 100), sources: ['raw_lead_data'], metadata }
  } catch {
    return { score: 0, sources: [], metadata: { error: 'stage-social-failed' } }
  }
}
