import { enrichLead } from '../enrichment/enrichment-pipeline'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

const mockRawLead: RawLeadInput = {
  name: 'Restaurante Sushi Tokyo',
  address: 'Av. Paulista, 1000',
  city: 'São Paulo',
  state: 'SP',
  phone: '(11) 9999-0000',
  website: 'https://sushitokyo.com.br',
  category: 'restaurant',
  lat: -23.561,
  lng: -46.656,
  rating: 4.5,
  reviewCount: 120,
  rawJson: { place_id: 'abc123', rating: 4.5 },
  source: 'google-places',
  externalId: 'ext-001',
  siteReachable: true,
  siteMobileFriendly: true,
  siteHasSsl: true,
  priceLevel: 2,
}

describe('enrichLead', () => {
  it('[SUCCESS] enriquece lead completo e retorna EnrichedLeadData válido', async () => {
    const result = await enrichLead(mockRawLead)

    expect(result.name).toBe('Restaurante Sushi Tokyo')
    expect(result.scores.websitePresence).toBeGreaterThan(0)
    expect(result.scores.digitalGap).toBeGreaterThanOrEqual(0)
    expect(result.scores.digitalGap).toBeLessThanOrEqual(100)
    expect(result.enrichmentSources.length).toBeGreaterThan(0)
    expect(result.enrichedAt).toBeInstanceOf(Date)
  })

  it('[SUCCESS] digital gap é alto para negócio sem site', async () => {
    const rawWithoutSite: RawLeadInput = { ...mockRawLead, website: null, siteReachable: false }
    const result = await enrichLead(rawWithoutSite)
    expect(result.scores.digitalGap).toBeGreaterThanOrEqual(70)
  })

  it('[SUCCESS] digital gap é baixo para negócio com presença digital completa', async () => {
    const result = await enrichLead(mockRawLead) // website + SSL + mobile + 120 reviews + priceLevel 2
    expect(result.scores.digitalGap).toBeLessThan(50)
  })

  it('[EDGE] não lança exceção para lead com dados mínimos', async () => {
    const minimal: RawLeadInput = {
      name: 'Loja X', address: null, city: null, state: null,
      phone: null, website: null, category: null,
      lat: null, lng: null, rating: null, reviewCount: null,
      rawJson: {}, source: 'google-places', externalId: 'ext-min',
    }
    await expect(enrichLead(minimal)).resolves.toBeDefined()
  })

  it('[EDGE] todos os scores estão no range 0-100', async () => {
    const result = await enrichLead(mockRawLead)
    for (const [key, score] of Object.entries(result.scores)) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
      void key
    }
  })
})
