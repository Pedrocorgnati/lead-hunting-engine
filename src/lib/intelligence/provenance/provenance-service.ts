import { getPrisma } from '@/lib/prisma'
import { DataSource } from '@/lib/constants/enums'

export interface ProvenanceEntry {
  leadId: string
  rawLeadDataId: string
  field: string
  source: string     // slug do provider (ex: 'google-places')
  confidence: number // 0-1
}

/**
 * Converte slug de source para enum DataSource do Prisma.
 */
function toDataSource(source: string): DataSource {
  const map: Record<string, DataSource> = {
    'google-places': DataSource.GOOGLE_MAPS,
    'outscraper': DataSource.OUTSCRAPER,
    'apify': DataSource.APIFY,
    'here-maps': DataSource.HERE_PLACES,
    'tomtom': DataSource.TOMTOM,
  }
  return map[source] ?? DataSource.GOOGLE_MAPS
}

/**
 * Serviço de rastreabilidade LGPD Art.18.
 * Registra a origem e confiança de cada campo coletado por lead.
 */
export class ProvenanceService {
  /**
   * Insere múltiplas entradas de provenance em uma única query.
   * skipDuplicates previne re-inserção para o mesmo (leadId, field).
   */
  static async recordBatch(entries: ProvenanceEntry[]): Promise<void> {
    if (entries.length === 0) return

    const prisma = getPrisma()
    try {
      await prisma.dataProvenance.createMany({
        data: entries.map(e => ({
          leadId: e.leadId,
          rawLeadDataId: e.rawLeadDataId,
          field: e.field,
          source: toDataSource(e.source),
          confidence: e.confidence,
          collectedAt: new Date(),
        })),
        skipDuplicates: true,
      })
    } catch (err) {
      // Log mas não quebra o pipeline — provenance é auditoria, não bloqueante
      console.error('[ProvenanceService] Falha ao registrar provenance:', err)
    }
  }

  /**
   * Constrói as entradas de provenance para um lead a partir dos dados brutos.
   * Registra: name, phone, website, rating (se disponíveis).
   */
  static buildEntries(
    leadId: string,
    rawLeadDataId: string,
    enriched: {
      name: string
      phone: string | null
      website: string | null
      rating: number | null
      source: string
    },
  ): ProvenanceEntry[] {
    const entries: ProvenanceEntry[] = []

    if (enriched.name) {
      entries.push({ leadId, rawLeadDataId, field: 'name', source: enriched.source, confidence: 0.95 })
    }
    if (enriched.phone) {
      entries.push({ leadId, rawLeadDataId, field: 'phone', source: enriched.source, confidence: 0.90 })
    }
    if (enriched.website) {
      entries.push({ leadId, rawLeadDataId, field: 'website', source: enriched.source, confidence: 0.95 })
    }
    if (enriched.rating != null) {
      entries.push({ leadId, rawLeadDataId, field: 'rating', source: 'google-places', confidence: 0.98 })
    }

    return entries
  }
}
