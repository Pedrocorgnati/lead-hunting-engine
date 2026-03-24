import type { EnrichmentStageResult } from './types'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

export async function stageLocationAccess(raw: RawLeadInput): Promise<EnrichmentStageResult> {
  try {
    let score = 50  // Neutro: sem dados de localização suficientes
    const metadata: Record<string, unknown> = {}

    if (raw.lat && raw.lng) {
      score += 20  // Tem coordenadas GPS
      metadata.hasCoordinates = true
    }

    if (raw.address) {
      score += 20  // Tem endereço estruturado
      metadata.hasAddress = true
    }

    // Bônus por capitais de estado (acesso a consumidores maior)
    const capitals = ['são paulo', 'rio de janeiro', 'belo horizonte', 'brasília', 'curitiba',
                      'porto alegre', 'salvador', 'recife', 'fortaleza', 'manaus']
    if (raw.city && capitals.some(c => raw.city!.toLowerCase().includes(c))) {
      score += 10
      metadata.isCapital = true
    }

    return { score: Math.min(score, 100), sources: ['raw_lead_data'], metadata }
  } catch {
    return { score: 50, sources: [], metadata: { error: 'stage-location-failed' } }
  }
}
