import type { EnrichmentStageResult } from './types'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

export async function stageBusinessMaturity(raw: RawLeadInput): Promise<EnrichmentStageResult> {
  try {
    let score = 30  // Baseline: qualquer negócio encontrado no scraper tem presença mínima
    const metadata: Record<string, unknown> = {}

    if (raw.phone) { score += 25; metadata.hasPhone = true }
    if (raw.address) { score += 20; metadata.hasAddress = true }
    if ((raw.reviewCount ?? 0) >= 50) { score += 25; metadata.matureByReviews = true }

    return { score: Math.min(score, 100), sources: ['raw_lead_data'], metadata }
  } catch {
    return { score: 30, sources: [], metadata: { error: 'stage-maturity-failed' } }
  }
}
