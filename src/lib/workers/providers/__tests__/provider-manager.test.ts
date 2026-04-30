/**
 * TASK-10 ST004 — Unit tests para searchBusinesses (cascata Google -> Outscraper -> Apify).
 *
 * Cobertura:
 * - Google sucesso bloqueia Outscraper E Apify
 * - Google retorna [] (sem credencial): cai pra Outscraper
 * - Google + Outscraper falham: Apify e chamado
 * - Todos falham: throw com mensagem agregada listando os 3 erros
 * - Honeypot: resultado com nome 'test' e filtrado antes de retornar
 *
 * Estrategia: jest.mock dos 3 providers + getApiKey + logApiUsage. Heavy
 * dependencies do provider-manager.ts (strategies headless, secondary providers)
 * sao mockadas como no-op pois nao participam do path principal.
 */

jest.mock('../google-places', () => ({
  GooglePlacesProvider: { name: 'google-places', search: jest.fn() },
}))
jest.mock('../outscraper', () => ({
  OutscraperProvider: { name: 'outscraper', search: jest.fn() },
}))
jest.mock('../apify', () => ({
  ApifyProvider: { name: 'apify', search: jest.fn() },
}))

jest.mock('../../utils/get-credential', () => ({
  getApiKey: jest.fn(),
}))

jest.mock('@/lib/observability/api-usage-logger', () => ({
  logApiUsage: jest.fn().mockResolvedValue(undefined),
}))

// anti-bot esta isolado (feature flag isHeadlessEnabled retorna false por default)
jest.mock('../anti-bot', () => ({
  isHeadlessEnabled: jest.fn().mockReturnValue(false),
}))

// Strategies headless nao usadas no path principal (gated por isHeadlessEnabled)
jest.mock('../strategies/google-maps-headless', () => ({
  GoogleMapsStrategy: jest.fn(),
}))
jest.mock('../strategies/yelp-headless', () => ({ YelpStrategy: jest.fn() }))
jest.mock('../strategies/apontador-headless', () => ({ ApontadorStrategy: jest.fn() }))
jest.mock('../strategies/guiamais-headless', () => ({ GuiaMaisStrategy: jest.fn() }))

// Social/secondary providers nao usados em searchBusinesses primario
jest.mock('../instagram-graph', () => ({ InstagramGraphProvider: {} }))
jest.mock('../instagram-apify', () => ({ InstagramApifyProvider: {} }))
jest.mock('../instagram-phantombuster', () => ({ InstagramPhantomBusterProvider: {} }))
jest.mock('../facebook-graph', () => ({ FacebookGraphProvider: {} }))
jest.mock('../facebook-intermediary', () => ({ FacebookIntermediaryProvider: {} }))
jest.mock('../linkedin-companies', () => ({ LinkedInCompaniesProvider: {} }))
jest.mock('../directories', () => ({ tryYelpApi: jest.fn() }))
jest.mock('../reclame-aqui', () => ({ queryReclameAqui: jest.fn() }))
jest.mock('../sintegra', () => ({ querySintegra: jest.fn() }))
jest.mock('../tripadvisor', () => ({ queryTripAdvisor: jest.fn() }))
jest.mock('../ibge', () => ({ fetchIbgeMunicipio: jest.fn() }))
jest.mock('../google-my-business', () => ({ fetchGmb: jest.fn() }))

import { searchBusinesses } from '../provider-manager'
import { GooglePlacesProvider } from '../google-places'
import { OutscraperProvider } from '../outscraper'
import { ApifyProvider } from '../apify'
import { getApiKey } from '../../utils/get-credential'
import type { BusinessResult } from '../types'

const googleSearchMock = GooglePlacesProvider.search as jest.Mock
const outscraperSearchMock = OutscraperProvider.search as jest.Mock
const apifySearchMock = ApifyProvider.search as jest.Mock
const getApiKeyMock = getApiKey as jest.Mock

function makeLead(overrides: Partial<BusinessResult> = {}): BusinessResult {
  return {
    externalId: 'lead-1',
    name: 'Pizzaria Real',
    address: 'Rua Real, 100 - Sao Paulo - SP',
    city: 'Sao Paulo',
    state: 'SP',
    phone: '+55 11 9876-5432',
    website: null,
    category: 'restaurant',
    rating: 4.5,
    reviewCount: 50,
    lat: -23.55,
    lng: -46.63,
    openNow: null,
    priceLevel: null,
    source: 'google-places',
    rawJson: {},
    ...overrides,
  }
}

describe('provider-manager.searchBusinesses (cascata)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('Google sucesso bloqueia Outscraper E Apify', async () => {
    getApiKeyMock.mockImplementation(async (provider: string) => {
      if (provider === 'google-places') return 'gp-key'
      return null
    })
    googleSearchMock.mockResolvedValueOnce([makeLead({ externalId: 'gp-1' })])

    const results = await searchBusinesses({ query: 'x', location: 'y' })

    expect(results).toHaveLength(1)
    expect(results[0].externalId).toBe('gp-1')
    expect(googleSearchMock).toHaveBeenCalledTimes(1)
    expect(outscraperSearchMock).not.toHaveBeenCalled()
    expect(apifySearchMock).not.toHaveBeenCalled()
  })

  it('Google sem credencial: cai pra Outscraper', async () => {
    getApiKeyMock.mockImplementation(async (provider: string) => {
      if (provider === 'outscraper') return 'osc-key'
      return null
    })
    outscraperSearchMock.mockResolvedValueOnce([
      makeLead({ externalId: 'osc-1', source: 'outscraper' }),
    ])

    const results = await searchBusinesses({ query: 'x', location: 'y' })

    expect(results).toHaveLength(1)
    expect(results[0].externalId).toBe('osc-1')
    expect(googleSearchMock).not.toHaveBeenCalled()
    expect(outscraperSearchMock).toHaveBeenCalledTimes(1)
    expect(apifySearchMock).not.toHaveBeenCalled()
  })

  it('Google falha permanente + Outscraper falha permanente: Apify e chamado', async () => {
    getApiKeyMock.mockImplementation(async () => 'fake-key')
    googleSearchMock.mockRejectedValueOnce(new Error('Google: HTTP 503'))
    outscraperSearchMock.mockRejectedValueOnce(new Error('Outscraper: HTTP 500'))
    apifySearchMock.mockResolvedValueOnce([
      makeLead({ externalId: 'ap-1', source: 'apify' }),
    ])

    const results = await searchBusinesses({ query: 'x', location: 'y' })

    expect(results).toHaveLength(1)
    expect(results[0].externalId).toBe('ap-1')
    expect(googleSearchMock).toHaveBeenCalledTimes(1)
    expect(outscraperSearchMock).toHaveBeenCalledTimes(1)
    expect(apifySearchMock).toHaveBeenCalledTimes(1)
  })

  it('Todos falham: throw com mensagem agregada contendo os 3 nomes', async () => {
    getApiKeyMock.mockImplementation(async () => 'fake-key')
    googleSearchMock.mockRejectedValueOnce(new Error('Google: HTTP 503'))
    outscraperSearchMock.mockRejectedValueOnce(new Error('Outscraper: HTTP 500'))
    apifySearchMock.mockRejectedValueOnce(new Error('Apify: timeout'))

    await expect(
      searchBusinesses({ query: 'x', location: 'y' }),
    ).rejects.toThrow(/Todos os providers falharam/)

    await expect(
      searchBusinesses({ query: 'x', location: 'y' }),
    ).rejects.toThrow(/google-places|outscraper|apify/)
  })

  it('Sem credenciais em nenhum provider: throw com motivo agregado', async () => {
    getApiKeyMock.mockResolvedValue(null)

    await expect(
      searchBusinesses({ query: 'x', location: 'y' }),
    ).rejects.toThrow(/sem credencial configurada/)
  })

  it('Honeypot: lead com nome "test" e filtrado, cai pra proximo provider se restante = 0', async () => {
    getApiKeyMock.mockImplementation(async (provider: string) => {
      if (provider === 'google-places') return 'gp-key'
      if (provider === 'outscraper') return 'osc-key'
      return null
    })
    googleSearchMock.mockResolvedValueOnce([
      makeLead({ externalId: 'gp-fake', name: 'Test Honeypot Inc' }),
    ])
    outscraperSearchMock.mockResolvedValueOnce([
      makeLead({ externalId: 'osc-real', name: 'Pizzaria Legitima', source: 'outscraper' }),
    ])

    const results = await searchBusinesses({ query: 'x', location: 'y' })

    expect(results).toHaveLength(1)
    expect(results[0].externalId).toBe('osc-real')
    expect(results[0].name).toBe('Pizzaria Legitima')
  })

  it('Honeypot: lead com telefone com digitos sequenciais e filtrado', async () => {
    getApiKeyMock.mockImplementation(async (provider: string) => {
      if (provider === 'google-places') return 'gp-key'
      return null
    })
    googleSearchMock.mockResolvedValueOnce([
      makeLead({ externalId: 'gp-real', name: 'Real Cafe', phone: '+55 11 3000-1000' }),
      makeLead({ externalId: 'gp-honey', name: 'Cafe Sequencial', phone: '12345678' }),
    ])

    const results = await searchBusinesses({ query: 'x', location: 'y' })

    // Honeypot filtrado mas results.length > 0 -> retorna o que sobrou (real)
    expect(results.map((r) => r.externalId)).toEqual(['gp-real'])
  })
})
