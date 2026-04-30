/**
 * TASK-10 — Unit tests para GooglePlacesProvider.
 *
 * Cobertura:
 * - Parse de TextSearch response (lat/lng, name, address, rating)
 * - REQUEST_DENIED throw com mensagem clara
 * - OVER_QUERY_LIMIT throw com mensagem clara
 * - ZERO_RESULTS retorna []
 * - Paginacao com next_page_token aciona segunda fetch
 *
 * Estrategia: mockar global.fetch e mockar RateLimiter para evitar sleeps reais.
 */

jest.mock('../../utils/rate-limiter', () => ({
  RateLimiter: { wait: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('../../utils/retry-backoff', () => ({
  withRetry: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}))

import { GooglePlacesProvider } from '../google-places'

const API_KEY = 'fake-google-key'

interface MockResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  const response: MockResponse = {
    ok,
    status,
    json: async () => payload,
  }
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(response)
}

describe('GooglePlacesProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('parse TextSearch response com lat/lng, name, address e rating', async () => {
    mockFetchOnce({
      status: 'OK',
      results: [
        {
          place_id: 'gp:abc-1',
          name: 'Pizzaria Teste',
          formatted_address: 'Rua A, 123 - Bairro, Sao Paulo - SP, 01000-000, Brasil',
          types: ['pizzaria', 'restaurant'],
          rating: 4.5,
          user_ratings_total: 100,
          geometry: { location: { lat: -23.55, lng: -46.63 } },
        },
      ],
    })

    const results = await GooglePlacesProvider.search(
      { query: 'pizzaria', location: 'Sao Paulo, SP' },
      API_KEY
    )

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      externalId: 'gp:abc-1',
      name: 'Pizzaria Teste',
      rating: 4.5,
      reviewCount: 100,
      lat: -23.55,
      lng: -46.63,
      source: 'google-places',
    })
  })

  it('REQUEST_DENIED throw com mensagem identificando a causa', async () => {
    mockFetchOnce({ status: 'REQUEST_DENIED', results: [] })

    await expect(
      GooglePlacesProvider.search({ query: 'x', location: 'y' }, API_KEY)
    ).rejects.toThrow(/REQUEST_DENIED/)
  })

  it('OVER_QUERY_LIMIT throw com mensagem de quota', async () => {
    mockFetchOnce({ status: 'OVER_QUERY_LIMIT', results: [] })

    await expect(
      GooglePlacesProvider.search({ query: 'x', location: 'y' }, API_KEY)
    ).rejects.toThrow(/OVER_QUERY_LIMIT/)
  })

  it('ZERO_RESULTS / sem results retorna []', async () => {
    mockFetchOnce({ status: 'ZERO_RESULTS', results: [] })

    const results = await GooglePlacesProvider.search(
      { query: 'inexistente', location: 'lugar nenhum' },
      API_KEY
    )

    expect(results).toEqual([])
  })

  it('paginacao com next_page_token aciona segunda fetch e agrega resultados', async () => {
    mockFetchOnce({
      status: 'OK',
      next_page_token: 'token-page-2',
      results: [
        {
          place_id: 'gp:1',
          name: 'A',
          formatted_address: 'Rua X, Sao Paulo - SP',
          types: ['restaurant'],
          geometry: { location: { lat: 0, lng: 0 } },
        },
      ],
    })
    mockFetchOnce({
      status: 'OK',
      results: [
        {
          place_id: 'gp:2',
          name: 'B',
          formatted_address: 'Rua Y, Sao Paulo - SP',
          types: ['restaurant'],
          geometry: { location: { lat: 0, lng: 0 } },
        },
      ],
    })

    // mockar setTimeout do delay de 2s para nao tornar teste lento
    jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void) => {
      cb()
      return 0 as unknown as NodeJS.Timeout
    }) as unknown as typeof setTimeout)

    const results = await GooglePlacesProvider.search(
      { query: 'pizza', location: 'Sao Paulo, SP', maxResults: 10 },
      API_KEY
    )

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(results).toHaveLength(2)
    expect(results[0].externalId).toBe('gp:1')
    expect(results[1].externalId).toBe('gp:2')
  })

  it('respeita maxResults via slice', async () => {
    mockFetchOnce({
      status: 'OK',
      results: Array.from({ length: 20 }, (_, i) => ({
        place_id: `gp:${i}`,
        name: `Place ${i}`,
        formatted_address: 'Rua X, Sao Paulo - SP',
        types: ['restaurant'],
        geometry: { location: { lat: 0, lng: 0 } },
      })),
    })

    const results = await GooglePlacesProvider.search(
      { query: 'x', location: 'y', maxResults: 5 },
      API_KEY
    )

    expect(results).toHaveLength(5)
  })

  it('inclui apiKey na URL como query param', async () => {
    mockFetchOnce({ status: 'OK', results: [] })

    await GooglePlacesProvider.search({ query: 'x', location: 'y' }, API_KEY)

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(fetchCall).toContain(`key=${API_KEY}`)
    expect(fetchCall).toContain('language=pt-BR')
  })
})
