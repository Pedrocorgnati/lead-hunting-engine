import type { EnrichmentStageResult } from './types'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

export async function stageWebsitePresence(raw: RawLeadInput): Promise<EnrichmentStageResult> {
  try {
    let score = 0
    const metadata: Record<string, unknown> = {}

    // +40: tem website
    if (raw.website) {
      score += 40
      metadata.hasWebsite = true

      // +20: HTTPS
      if (raw.website.startsWith('https://')) {
        score += 20
        metadata.hasSsl = true
      }

      // +20: site acessível (siteReachable do RawLeadData)
      if (raw.siteReachable) {
        score += 20
        metadata.siteReachable = true
      }

      // +20: mobile friendly
      if (raw.siteMobileFriendly) {
        score += 20
        metadata.mobileFriendly = true
      }
    }

    return { score: Math.min(score, 100), sources: ['raw_lead_data'], metadata }
  } catch {
    return { score: 0, sources: [], metadata: { error: 'stage-website-failed' } }
  }
}
