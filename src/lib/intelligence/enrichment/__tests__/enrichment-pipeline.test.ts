/**
 * Testes da pipeline de enriquecimento — nivel do sinal WhatsApp (blacksmith
 * 06-11, criterio 19) e merge nao-destrutivo de enrichmentData (criterio 20).
 *
 * Regra de nivel (contrato enrichment-data.ts):
 *  - 'confirmed' SOMENTE com siteHtml E evidencia do detector (source 'site_html');
 *  - 'probable'  deriva de celular BR valido via phone-classifier;
 *  - 'unknown'   caso contrario — e 'probable' NUNCA seta o boolean legado.
 */

import { enrichLead } from '../enrichment-pipeline'
import {
  mergeEnrichmentData,
  readContactDiscovery,
  readWhatsappEnrichment,
  CONTACT_DISCOVERY_STEPS,
} from '../enrichment-data'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

function makeRaw(overrides: Partial<RawLeadInput> = {}): RawLeadInput {
  return {
    externalId: 'ext-1',
    name: 'Padaria Teste',
    source: 'GOOGLE_MAPS',
    rawJson: {},
    ...overrides,
  }
}

describe('enrichLead — nivel do sinal WhatsApp (criterio 19)', () => {
  it('confirmed: wa.me no HTML gera nivel confirmado com source site_html', async () => {
    const raw = makeRaw({
      phone: '(11) 99999-8888',
      rawJson: {
        siteHtml: '<a href="https://wa.me/5511999998888">Chame no WhatsApp</a>',
      },
    })

    const enriched = await enrichLead(raw)

    expect(enriched.whatsapp.level).toBe('confirmed')
    expect(enriched.whatsapp.source).toBe('site_html')
    expect(enriched.whatsapp.evidence).toContain('wa.me-link')
    expect(enriched.whatsapp.confidence).toBeGreaterThanOrEqual(0.3)
    expect(enriched.whatsapp.number).toBe('+5511999998888')
    expect(typeof enriched.whatsapp.detectedAt).toBe('string')
    expect(enriched.whatsapp.detectedAt).not.toBe('')
    // Boolean legado segue a semantica original (HTML presente + detector).
    expect(enriched.isWhatsappChannel).toBe(true)
  })

  it('probable: celular BR valido sem HTML — boolean legado permanece null', async () => {
    const raw = makeRaw({ phone: '(11) 99999-8888' })

    const enriched = await enrichLead(raw)

    expect(enriched.whatsapp.level).toBe('probable')
    expect(enriched.whatsapp.source).toBe('phone_classifier')
    expect(enriched.whatsapp.number).toBeNull()
    expect(enriched.whatsapp.confidence).toBe(0)
    // Sem number nao ha como afirmar divergencia.
    expect(enriched.whatsapp.numberDivergesFromPhone).toBeNull()
    // 'probable' NUNCA seta o boolean legado (criterio 19 — fail-closed).
    expect(enriched.isWhatsappChannel).toBeNull()
  })

  it('unknown: telefone fixo sem HTML', async () => {
    const raw = makeRaw({ phone: '(11) 3333-4444' })

    const enriched = await enrichLead(raw)

    expect(enriched.whatsapp.level).toBe('unknown')
    expect(enriched.whatsapp.source).toBeNull()
    expect(enriched.isWhatsappChannel).toBeNull()
  })

  it('unknown: sem telefone e sem HTML', async () => {
    const raw = makeRaw()

    const enriched = await enrichLead(raw)

    expect(enriched.whatsapp.level).toBe('unknown')
    expect(enriched.whatsapp.source).toBeNull()
    expect(enriched.whatsapp.number).toBeNull()
    expect(enriched.whatsapp.numberDivergesFromPhone).toBeNull()
  })

  it('numero extraido divergente de Lead.phone marca numberDivergesFromPhone', async () => {
    const raw = makeRaw({
      phone: '(11) 99999-8888',
      rawJson: {
        siteHtml: '<a href="https://wa.me/5511888887777">WhatsApp</a>',
      },
    })

    const enriched = await enrichLead(raw)

    expect(enriched.whatsapp.number).toBe('+5511888887777')
    expect(enriched.whatsapp.numberDivergesFromPhone).toBe(true)
  })

  it('mesmo numero em formato diferente NAO marca divergencia (tolerancia a +55)', async () => {
    const raw = makeRaw({
      phone: '(11) 99999-8888',
      rawJson: {
        siteHtml: '<a href="https://wa.me/5511999998888">WhatsApp</a>',
      },
    })

    const enriched = await enrichLead(raw)

    expect(enriched.whatsapp.number).toBe('+5511999998888')
    expect(enriched.whatsapp.numberDivergesFromPhone).toBe(false)
  })

  it('numberDivergesFromPhone e null quando ha numero mas nao ha phone', async () => {
    const raw = makeRaw({
      rawJson: {
        siteHtml: '<a href="https://wa.me/5511888887777">WhatsApp</a>',
      },
    })

    const enriched = await enrichLead(raw)

    expect(enriched.whatsapp.number).toBe('+5511888887777')
    expect(enriched.whatsapp.numberDivergesFromPhone).toBeNull()
  })
})

describe('mergeEnrichmentData — shapes reais gravados por process-leads-core (criterio 20)', () => {
  it('merge do patch da pipeline preserva chaves do worker de crawl e une steps', async () => {
    // enrichmentData como o worker de crawl teria deixado no banco.
    const existing = {
      scores: { websitePresence: 10 },
      crawl: { lastUrl: 'https://empresa.com.br/contato' },
      contactDiscovery: {
        completedAt: '2026-06-10T00:00:00.000Z',
        steps: [CONTACT_DISCOVERY_STEPS.CRAWL_HOME],
        version: 1,
      },
    }

    // Patch com o MESMO shape que process-leads-core grava pos-enriquecimento.
    const raw = makeRaw({
      phone: '(11) 99999-8888',
      rawJson: { siteHtml: '<a href="https://wa.me/5511999998888">WhatsApp</a>' },
    })
    const enriched = await enrichLead(raw)
    const completedAt = new Date().toISOString()
    const patch = {
      scores: enriched.scores,
      sources: enriched.enrichmentSources,
      enrichedAt: enriched.enrichedAt,
      whatsapp: enriched.whatsapp,
      contactDiscovery: {
        completedAt,
        steps: [CONTACT_DISCOVERY_STEPS.ENRICHMENT_PIPELINE],
        version: 1 as const,
      },
    }

    const merged = mergeEnrichmentData(existing, patch)

    // Chave de outro escritor preservada (nunca substituir o objeto inteiro).
    expect(merged.crawl).toEqual({ lastUrl: 'https://empresa.com.br/contato' })
    // scores/sources/enrichedAt atualizados pelo patch.
    expect(merged.scores).toEqual(enriched.scores)
    expect(merged.enrichedAt).toBe(enriched.enrichedAt)
    // Bloco whatsapp legivel pelo contrato canonico.
    const whatsapp = readWhatsappEnrichment(merged)
    expect(whatsapp?.level).toBe('confirmed')
    expect(whatsapp?.number).toBe('+5511999998888')
    // Steps de descoberta UNIDOS (crawl + pipeline), completedAt do patch.
    const marker = readContactDiscovery(merged)
    expect(marker?.completedAt).toBe(completedAt)
    expect(marker?.steps).toEqual(
      expect.arrayContaining([
        CONTACT_DISCOVERY_STEPS.CRAWL_HOME,
        CONTACT_DISCOVERY_STEPS.ENRICHMENT_PIPELINE,
      ]),
    )
    expect(marker?.steps).toHaveLength(2)
  })

  it('merge sobre {} (caminho de CREATE) materializa whatsapp e contactDiscovery', async () => {
    const raw = makeRaw({ phone: '(11) 99999-8888' })
    const enriched = await enrichLead(raw)
    const merged = mergeEnrichmentData({}, {
      scores: enriched.scores,
      sources: enriched.enrichmentSources,
      enrichedAt: enriched.enrichedAt,
      whatsapp: enriched.whatsapp,
      contactDiscovery: {
        completedAt: new Date().toISOString(),
        steps: [CONTACT_DISCOVERY_STEPS.ENRICHMENT_PIPELINE],
        version: 1 as const,
      },
    })

    expect(readWhatsappEnrichment(merged)?.level).toBe('probable')
    const marker = readContactDiscovery(merged)
    expect(marker?.steps).toEqual([CONTACT_DISCOVERY_STEPS.ENRICHMENT_PIPELINE])
    expect(marker?.completedAt).not.toBe('')
  })
})
