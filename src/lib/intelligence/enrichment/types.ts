import type { WhatsappEnrichment } from './enrichment-data'

export interface EnrichedLeadData {
  // Dados base
  name: string
  address: string | null
  city: string | null
  state: string | null
  phone: string | null
  website: string | null
  category: string | null
  lat: number | null
  lng: number | null
  rating: number | null

  // Scores por dimensão (0-100 cada)
  scores: {
    websitePresence: number      // Estágio 1: presença web (+SSL, +acessibilidade, +mobile)
    socialPresence: number       // Estágio 2: GMB, redes sociais, reviews significativas
    reviewsRating: number        // Estágio 3: rating (0-5→0-50) + volume de reviews (0-50)
    locationAccess: number       // Estágio 4: coordenadas, endereço, capital
    businessMaturity: number     // Estágio 5: telefone, endereço, reviews (negócio estabelecido)
    digitalGap: number           // Estágio 6: INVERSO — gap alto = mais oportunidade de venda
  }

  // TASK-3 intake-review (CL-058/059/060): sinais estruturados dos enrichers dedicados
  isWhatsappChannel?: boolean | null
  hasEcommerce?: boolean | null
  ecommercePlatform?: string | null
  analyticsPixels?: string[]

  // Feature aumentar e-mails/WhatsApp (blacksmith 06-11, criterio 19): sinal
  // WhatsApp com nivel. 'confirmed' SOMENTE com evidencia de HTML; 'probable'
  // deriva de celular BR valido (phone-classifier); 'unknown' caso contrario.
  // Shape canonico em enrichment-data.ts — persistido em Lead.enrichmentData.
  whatsapp: WhatsappEnrichment

  // P-09: campos derivados ja computados em stage-website.metadata, expostos
  // para persistencia no Lead (antes eram calculados e descartados).
  emailPrimary?: string | null   // email priorizado (generico > pessoal) descoberto
  uxScore?: number | null        // 0-100 da analise de UX do HTML capturado
  uxSignals?: unknown            // sinais de UX para debug/admin

  // Metadata de enriquecimento
  enrichmentSources: string[]   // ex: ['raw_lead_data', 'google-places']
  enrichedAt: Date
}

export interface EnrichmentStageResult {
  score: number          // 0-100
  sources: string[]      // ex: ['google-places'], ['raw_lead_data']
  metadata: Record<string, unknown>  // dados intermediários para debug/provenance
}
