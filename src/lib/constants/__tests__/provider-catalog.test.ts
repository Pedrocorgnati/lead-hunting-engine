import { PROVIDER_CATALOG } from '../provider-catalog'

describe('PROVIDER_CATALOG categorization (H-06/H-10)', () => {
  const find = (s: string) => PROVIDER_CATALOG.find((p) => p.source === s)

  it('HERE_MAPS e TOMTOM sao OTHER (geocoders), nao BUSINESS', () => {
    expect(find('HERE_MAPS')?.category).toBe('OTHER')
    expect(find('TOMTOM')?.category).toBe('OTHER')
  })

  it('OPENAI/ANTHROPIC sao LLM (pitch), nao BUSINESS', () => {
    expect(find('OPENAI')?.category).toBe('LLM')
    expect(find('ANTHROPIC')?.category).toBe('LLM')
  })

  it('o filtro BUSINESS so retorna fontes reais de coleta', () => {
    const business = PROVIDER_CATALOG.filter((p) => p.category === 'BUSINESS').map((p) => p.source)
    // geocoders e LLMs fora
    expect(business).not.toContain('HERE_MAPS')
    expect(business).not.toContain('TOMTOM')
    expect(business).not.toContain('OPENAI')
    expect(business).not.toContain('ANTHROPIC')
    // fontes reais dentro
    expect(business).toContain('GOOGLE_PLACES')
    expect(business).toContain('OUTSCRAPER')
    expect(business).toContain('APIFY')
  })
})
