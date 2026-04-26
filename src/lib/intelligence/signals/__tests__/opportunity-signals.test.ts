import {
  OPPORTUNITY_SIGNALS,
  evaluateOpportunitySignals,
  getSignalDefinition,
} from '../opportunity-signals'
import type { EnrichedLeadData } from '../../enrichment/types'

function baseEnriched(overrides: Partial<EnrichedLeadData> = {}): EnrichedLeadData {
  return {
    name: 'Acme',
    address: null,
    city: null,
    state: null,
    phone: null,
    website: 'https://acme.com.br',
    category: null,
    lat: null,
    lng: null,
    rating: null,
    scores: {
      websitePresence: 60,
      socialPresence: 50,
      reviewsRating: 50,
      locationAccess: 50,
      businessMaturity: 60,
      digitalGap: 50,
    },
    isWhatsappChannel: false,
    hasEcommerce: false,
    ecommercePlatform: null,
    analyticsPixels: [],
    enrichmentSources: ['raw_lead_data'],
    enrichedAt: new Date(),
    ...overrides,
  }
}

describe('opportunity-signals catalog', () => {
  it('expoe 6 sinais conforme INTAKE (CL-063..CL-068)', () => {
    expect(OPPORTUNITY_SIGNALS).toHaveLength(6)
    const slugs = OPPORTUNITY_SIGNALS.map((s) => s.slug).sort()
    expect(slugs).toEqual([
      'improvised-ecommerce',
      'low-automation',
      'reviews-without-structure',
      'site-bad-or-absent',
      'strong-ig-weak-site',
      'whatsapp-manual',
    ])
  })

  it('getSignalDefinition retorna label ptBR', () => {
    const def = getSignalDefinition('whatsapp-manual')
    expect(def?.label_ptBR).toMatch(/WhatsApp/i)
  })

  it('getSignalDefinition retorna null para slug desconhecido', () => {
    expect(getSignalDefinition('foo-bar')).toBeNull()
  })
})

describe('evaluateOpportunitySignals', () => {
  it('dispara site-bad-or-absent quando sem website', () => {
    const fired = evaluateOpportunitySignals({
      enriched: baseEnriched({ website: null }),
      raw: null,
    })
    expect(fired).toContain('site-bad-or-absent')
  })

  it('dispara site-bad-or-absent quando site inacessivel', () => {
    const fired = evaluateOpportunitySignals({
      enriched: baseEnriched(),
      raw: { siteReachable: false, siteMobileFriendly: true, instagramFollowers: null, rawJson: {} },
    })
    expect(fired).toContain('site-bad-or-absent')
  })

  it('dispara whatsapp-manual quando isWhatsappChannel=true', () => {
    const fired = evaluateOpportunitySignals({
      enriched: baseEnriched({ isWhatsappChannel: true }),
      raw: null,
    })
    expect(fired).toContain('whatsapp-manual')
  })

  it('dispara strong-ig-weak-site quando IG >=10k e site inacessivel', () => {
    const fired = evaluateOpportunitySignals({
      enriched: baseEnriched(),
      raw: { siteReachable: false, siteMobileFriendly: true, instagramFollowers: 25_000, rawJson: {} },
    })
    expect(fired).toContain('strong-ig-weak-site')
  })

  it('dispara reviews-without-structure quando volume alto sem site', () => {
    const fired = evaluateOpportunitySignals({
      enriched: baseEnriched({ hasEcommerce: false }),
      raw: { siteReachable: false, siteMobileFriendly: true, instagramFollowers: null, rawJson: { reviewCount: 350 } },
    })
    expect(fired).toContain('reviews-without-structure')
  })

  it('dispara improvised-ecommerce quando bio menciona vendas mas sem plataforma', () => {
    const fired = evaluateOpportunitySignals({
      enriched: baseEnriched({ hasEcommerce: false }),
      raw: {
        siteReachable: true,
        siteMobileFriendly: true,
        instagramFollowers: 1000,
        rawJson: { instagramBio: 'Encomendas pelo direct! Vendas online diarias.' },
      },
    })
    expect(fired).toContain('improvised-ecommerce')
  })

  it('dispara low-automation quando business maturity baixa e sem sistemas', () => {
    const fired = evaluateOpportunitySignals({
      enriched: baseEnriched({ scores: { ...baseEnriched().scores, businessMaturity: 20 } }),
      raw: {
        siteReachable: true,
        siteMobileFriendly: true,
        instagramFollowers: null,
        rawJson: { hasAdminPanel: false, hasCrm: false, hasOnlineBooking: false },
      },
    })
    expect(fired).toContain('low-automation')
  })

  it('retorna array vazio quando nenhum sinal e disparado', () => {
    const fired = evaluateOpportunitySignals({
      enriched: baseEnriched({ scores: { ...baseEnriched().scores, businessMaturity: 80 } }),
      raw: {
        siteReachable: true,
        siteMobileFriendly: true,
        instagramFollowers: 500,
        rawJson: { reviewCount: 10, hasAdminPanel: true, hasCrm: true, hasOnlineBooking: true },
      },
    })
    expect(fired).toEqual([])
  })

  it('nao lanca excecao quando trigger individual quebra', () => {
    const fired = evaluateOpportunitySignals({
      enriched: baseEnriched(),
      raw: { siteReachable: true, siteMobileFriendly: true, instagramFollowers: null, rawJson: null as unknown as Record<string, unknown> },
    })
    expect(Array.isArray(fired)).toBe(true)
  })
})
