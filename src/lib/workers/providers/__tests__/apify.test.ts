/**
 * TASK-10 — Unit tests para ApifyProvider.
 *
 * Cobertura prioritaria:
 * - 60-iter terminal stop quando run nao completa (guardrail PERF/SEC)
 * - Status FAILED throw permanente
 * - Parse defaultDatasetId items mapeados para BusinessResult
 * - Authorization header com Bearer + apiKey
 *
 * Estrategia: mockar RateLimiter, withRetry e global.fetch.
 * setTimeout mockado para nao introduzir delays reais nos polls.
 */

jest.mock('../../utils/rate-limiter', () => ({
  RateLimiter: { wait: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('../../utils/retry-backoff', () => ({
  withRetry: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}))

import { ApifyProvider } from '../apify'

const API_KEY = 'fake-apify-token'

interface MockResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

function makeRes(payload: unknown, ok = true): MockResponse {
  return { ok, status: ok ? 200 : 500, json: async () => payload }
}

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
  jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void) => {
    cb()
    return 0 as unknown as NodeJS.Timeout
  }) as unknown as typeof setTimeout)
})

afterEach(() => {
  jest.clearAllMocks()
  ;(global.setTimeout as unknown as jest.SpyInstance).mockRestore?.()
})

describe('ApifyProvider', () => {
  it('60-iter terminal stop quando status fica RUNNING indefinidamente', async () => {
    // Primeira call: start run retorna runId
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValueOnce(makeRes({ data: { id: 'run-123' } }))

    // Todas as chamadas seguintes retornam status RUNNING
    fetchMock.mockResolvedValue(makeRes({ data: { status: 'RUNNING' } }))

    await expect(
      ApifyProvider.search({ query: 'pizza', location: 'SP', maxResults: 50 }, API_KEY)
    ).rejects.toThrow(/timeout aguardando conclus(ã|a)o/)
  })

  it('FAILED status throw permanente', async () => {
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValueOnce(makeRes({ data: { id: 'run-456' } }))
    fetchMock.mockResolvedValueOnce(makeRes({ data: { status: 'FAILED' } }))

    await expect(
      ApifyProvider.search({ query: 'x', location: 'y' }, API_KEY)
    ).rejects.toThrow(/falhou com status: FAILED/)
  })

  it('parse defaultDatasetId items para BusinessResult', async () => {
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValueOnce(makeRes({ data: { id: 'run-789' } }))
    fetchMock.mockResolvedValueOnce(
      makeRes({ data: { status: 'SUCCEEDED', defaultDatasetId: 'ds-001' } })
    )
    fetchMock.mockResolvedValueOnce(
      makeRes([
        {
          placeId: 'apify-1',
          title: 'Restaurante Z',
          address: 'Rua Y, SP',
          phone: '11999',
          website: 'https://z.com',
          totalScore: 4.0,
          reviewsCount: 50,
          location: { lat: -23, lng: -46 },
        },
      ])
    )

    const results = await ApifyProvider.search(
      { query: 'restaurante', location: 'SP' },
      API_KEY
    )

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      externalId: 'apify-1',
      name: 'Restaurante Z',
      address: 'Rua Y, SP',
      phone: '11999',
      website: 'https://z.com',
      rating: 4.0,
      reviewCount: 50,
      source: 'apify',
    })
  })

  it('inclui Authorization Bearer apiKey nos headers', async () => {
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValueOnce(makeRes({ data: { id: 'run-x' } }))
    fetchMock.mockResolvedValueOnce(
      makeRes({ data: { status: 'SUCCEEDED', defaultDatasetId: 'ds-x' } })
    )
    fetchMock.mockResolvedValueOnce(makeRes([]))

    await ApifyProvider.search({ query: 'x', location: 'y' }, API_KEY)

    const startRunCall = fetchMock.mock.calls[0]
    const startRunOpts = startRunCall[1] as RequestInit
    expect((startRunOpts.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${API_KEY}`
    )
  })

  it('throw quando start run falha (sem runId)', async () => {
    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValueOnce(makeRes({ data: {} })) // sem id

    await expect(
      ApifyProvider.search({ query: 'x', location: 'y' }, API_KEY)
    ).rejects.toThrow(/falhou ao iniciar run/)
  })
})
