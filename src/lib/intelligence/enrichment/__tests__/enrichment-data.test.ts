/**
 * Testes do contrato canonico de Lead.enrichmentData (enrichment-data.ts) —
 * foco no guard compartilhado mergeWhatsappEnrichment (review 06-11 R3-1):
 * o contrato dos 3 escritores exige que NENHUM escritor rebaixe o nivel do
 * sinal WhatsApp gravado por outro (confirmed > probable > unknown).
 */
import {
  mergeEnrichmentData,
  mergeWhatsappEnrichment,
  readWhatsappEnrichment,
  type WhatsappEnrichment,
} from '../enrichment-data'

function block(overrides: Partial<WhatsappEnrichment> = {}): WhatsappEnrichment {
  return {
    level: 'confirmed',
    confidence: 0.9,
    evidence: ['wa.me-link'],
    number: '+5511988887777',
    numberDivergesFromPhone: true,
    source: 'site_html',
    detectedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('mergeWhatsappEnrichment — guard de nivel (R3-1)', () => {
  it('sem bloco previo: o bloco novo entra como esta', () => {
    const next = block({ level: 'probable', source: 'phone_classifier', number: null })
    expect(mergeWhatsappEnrichment(null, next)).toEqual(next)
  })

  it("NUNCA rebaixa 'confirmed' pre-existente: retorna null para next 'unknown'/'probable'", () => {
    const prev = block()
    const unknown = block({ level: 'unknown', source: null, number: null, confidence: 0 })
    const probable = block({ level: 'probable', source: 'phone_classifier', number: null })
    expect(mergeWhatsappEnrichment(prev, unknown)).toBeNull()
    expect(mergeWhatsappEnrichment(prev, probable)).toBeNull()
  })

  it("nao rebaixa 'probable' para 'unknown'", () => {
    const prev = block({ level: 'probable', source: 'phone_classifier', number: null })
    const next = block({ level: 'unknown', source: null, number: null })
    expect(mergeWhatsappEnrichment(prev, next)).toBeNull()
  })

  it('nivel igual substitui (evidencia mais fresca vence)', () => {
    const prev = block({ detectedAt: '2026-06-01T00:00:00.000Z', confidence: 0.6 })
    const next = block({ detectedAt: '2026-06-11T00:00:00.000Z', confidence: 0.95 })
    expect(mergeWhatsappEnrichment(prev, next)).toEqual(next)
  })

  it("upgrade 'probable' -> 'confirmed' substitui o bloco", () => {
    const prev = block({ level: 'probable', source: 'phone_classifier', number: null })
    const next = block()
    expect(mergeWhatsappEnrichment(prev, next)).toEqual(next)
  })

  it('bloco novo sem numero herda number/numberDivergesFromPhone do previo', () => {
    const prev = block({ number: '+5511988887777', numberDivergesFromPhone: false })
    const next = block({ number: null, numberDivergesFromPhone: null, detectedAt: '2026-06-11T00:00:00.000Z' })
    expect(mergeWhatsappEnrichment(prev, next)).toEqual({
      ...next,
      number: '+5511988887777',
      numberDivergesFromPhone: false,
    })
  })
})

describe('integracao com mergeEnrichmentData (contrato dos 3 escritores)', () => {
  it('patch SEM a chave whatsapp (guard retornou null) preserva o bloco confirmed do worker', () => {
    const prev = block()
    const existing = {
      whatsapp: prev,
      contactDiscovery: { completedAt: '2026-06-10T00:00:00.000Z', steps: ['site_crawl_home'], version: 1 },
    }
    const next = block({ level: 'unknown', source: null, number: null })
    const guarded = mergeWhatsappEnrichment(readWhatsappEnrichment(existing), next)
    expect(guarded).toBeNull()

    const merged = mergeEnrichmentData(existing, {
      scores: { websitePresence: 10 },
      ...(guarded ? { whatsapp: guarded } : {}),
      contactDiscovery: { completedAt: '2026-06-11T00:00:00.000Z', steps: ['enrichment_pipeline'], version: 1 },
    })

    expect(merged.whatsapp).toEqual(prev)
    expect((merged.contactDiscovery as { steps: string[] }).steps).toEqual([
      'site_crawl_home',
      'enrichment_pipeline',
    ])
  })
})
