import type { EnrichmentStageResult } from './types'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

/**
 * Digital Gap: QUANTO MAIOR O SCORE, MAIOR O GAP, MAIOR A OPORTUNIDADE.
 * Score alto = negócio estabelecido SEM presença digital = cliente ideal para serviços digitais.
 */
export async function stageDigitalGap(raw: RawLeadInput): Promise<EnrichmentStageResult> {
  try {
    let gap = 100  // Começa com gap máximo (sem presença digital)
    const metadata: Record<string, unknown> = {}

    if (raw.website) {
      gap -= 30; metadata.hasWebsite = true
      // SSL e mobile friendly só reduzem o gap se o site existe
      if (raw.siteHasSsl) { gap -= 15; metadata.hasSsl = true }
      if (raw.siteMobileFriendly) { gap -= 15; metadata.isMobileFriendly = true }
    }
    if ((raw.reviewCount ?? 0) > 50) { gap -= 20; metadata.hasSignificantPresence = true }
    if (raw.priceLevel && raw.priceLevel >= 3) { gap -= 20; metadata.isPremium = true }

    metadata.gap = gap
    return { score: Math.max(0, gap), sources: ['raw_lead_data'], metadata }
  } catch {
    return { score: 50, sources: [], metadata: { error: 'stage-digital-gap-failed' } }
  }
}
