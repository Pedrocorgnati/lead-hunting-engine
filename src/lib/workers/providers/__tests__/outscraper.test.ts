/**
 * TASK-10 ST002 — Unit tests para OutscraperProvider.
 *
 * Cobertura:
 * - Header X-API-KEY presente na request
 * - Parse de response com campo data[0] aninhado
 * - HTTP 429 propaga como erro retry-able (mensagem com '429')
 * - HTTP nao-ok generico throw com status preservado
 * - Mapeamento de campos: place_id/google_id, full_address, site, latitude/longitude
 * - source = 'outscraper' em todos os resultados
 *
 * Estrategia: mockar global.fetch + RateLimiter + retry-backoff (passthrough).
 *
 * Nota sobre TASK-10 BDD vs codigo real:
 *   O BDD original mencionava "HTTP 402 retorna []" mas o codigo real lanca
 *   `Outscraper: HTTP 402` (mesma branch que qualquer non-ok). Os testes refletem
 *   o comportamento implementado — qualquer mudanca de contrato deve ir antes
 *   no provider e depois nos testes.
 */

jest.mock('../../utils/rate-limiter', () => ({
  RateLimiter: { wait: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('../../utils/retry-backoff', () => ({
  withRetry: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}))

import { OutscraperProvider } from '../outscraper'

const API_KEY = 'fake-outscraper-key'

interface MockResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  const response: MockResponse = { ok, status, json: async () => payload }
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(response)
}

describe('OutscraperProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('envia o header X-API-KEY com a chave decriptografada', async () => {
    mockFetchOnce({ data: [[]] })

    await OutscraperProvider.search({ query: 'x', location: 'y' }, API_KEY)

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
    const init = fetchCall[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['X-API-KEY']).toBe(API_KEY)
  })

  it('parse response com data[0] aninhado e mapeia campos para BusinessResult', async () => {
    mockFetchOnce({
      data: [
        [
          {
            place_id: 'osc:abc-1',
            google_id: '0xfff:0xaaa',
            name: 'Pizzaria Outscraper',
            full_address: 'Rua A, 123 - Centro, Sao Paulo - SP',
            city: 'Sao Paulo',
            state: 'SP',
            phone: '+55 11 3000-1000',
            site: 'https://example.test',
            type: 'Pizzeria',
            subtypes: ['Italian restaurant'],
            rating: 4.6,
            reviews: 250,
            latitude: -23.55,
            longitude: -46.63,
          },
        ],
      ],
    })

    const results = await OutscraperProvider.search(
      { query: 'pizzaria', location: 'Sao Paulo, SP' },
      API_KEY,
    )

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      externalId: 'osc:abc-1',
      name: 'Pizzaria Outscraper',
      address: 'Rua A, 123 - Centro, Sao Paulo - SP',
      city: 'Sao Paulo',
      state: 'SP',
      phone: '+55 11 3000-1000',
      website: 'https://example.test',
      category: 'Pizzeria',
      rating: 4.6,
      reviewCount: 250,
      lat: -23.55,
      lng: -46.63,
      source: 'outscraper',
    })
  })

  it('HTTP 429 propaga erro com mensagem "429 rate limit" (retry-able pra retry-backoff)', async () => {
    mockFetchOnce({}, false, 429)

    await expect(
      OutscraperProvider.search({ query: 'x', location: 'y' }, API_KEY),
    ).rejects.toThrow(/429/)
  })

  it('HTTP nao-ok generico throw preservando status (ex: 402 credito esgotado)', async () => {
    mockFetchOnce({ error: 'Insufficient credits' }, false, 402)

    await expect(
      OutscraperProvider.search({ query: 'x', location: 'y' }, API_KEY),
    ).rejects.toThrow(/HTTP 402/)
  })

  it('data ausente ou vazio retorna [] (sem throw)', async () => {
    mockFetchOnce({ status: 'Pending' }) // data missing

    const results = await OutscraperProvider.search(
      { query: 'x', location: 'y' },
      API_KEY,
    )

    expect(results).toEqual([])
  })

  it('externalId fallback determinista quando place_id ausente', async () => {
    mockFetchOnce({
      data: [
        [
          {
            // sem place_id e sem google_id
            name: 'Cafe sem id',
            full_address: 'Rua Z, Sao Paulo - SP',
          },
        ],
      ],
    })

    const results = await OutscraperProvider.search(
      { query: 'cafe', location: 'Sao Paulo, SP' },
      API_KEY,
    )

    expect(results).toHaveLength(1)
    expect(results[0].externalId).toMatch(/^outscraper:/)
    expect(results[0].externalId).toContain('Cafe sem id')
  })

  it('inclui query e limit corretamente na URL', async () => {
    mockFetchOnce({ data: [[]] })

    await OutscraperProvider.search(
      { query: 'pizzaria', location: 'Sao Paulo, SP', maxResults: 25 },
      API_KEY,
    )

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('query=pizzaria%20Sao%20Paulo%2C%20SP')
    expect(url).toContain('limit=25')
    expect(url).toContain('language=pt')
  })
})
