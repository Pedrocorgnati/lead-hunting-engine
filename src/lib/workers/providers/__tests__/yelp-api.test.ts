jest.mock('../../utils/rate-limiter', () => ({
  RateLimiter: { wait: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('../../utils/retry-backoff', () => ({
  withRetry: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
}))

import { YelpApiProvider } from '../directories/yelp'
import yelpFixture from '../../../../__tests__/fixtures/directories/yelp.json'

describe('YelpApiProvider', () => {
  afterEach(() => jest.restoreAllMocks())

  it('mapeia Yelp Fusion response para BusinessResult[]', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => yelpFixture,
    } as unknown as Response)

    const results = await YelpApiProvider.search(
      { query: 'restaurant', location: 'San Francisco' },
      'yelp-token',
    )

    expect(results).toHaveLength(2)
    const [first, second] = results
    expect(first).toMatchObject({
      source: 'yelp-api',
      name: 'Restaurante Anonimizado',
      rating: 4.2,
      reviewCount: 87,
      priceLevel: 2, // "$$" => 2
      openNow: true,
      state: 'CA',
      city: 'San Francisco',
    })
    expect(first.externalId).toContain('test-biz-001')
    expect(second.priceLevel).toBeNull()
    expect(second.openNow).toBe(false)
  })

  it('propaga YELP_API_TOKEN_MISSING em 401', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as unknown as Response)

    await expect(
      YelpApiProvider.search({ query: 'x', location: 'y' }, 'bad-token'),
    ).rejects.toThrow(/YELP_API_TOKEN_MISSING/)
  })

  it('sinaliza rate limit em 429', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as unknown as Response)

    await expect(
      YelpApiProvider.search({ query: 'x', location: 'y' }, 'token'),
    ).rejects.toThrow(/YELP_API_RATE_LIMITED/)
  })

  it('falha sem token explicitamente', async () => {
    await expect(
      YelpApiProvider.search({ query: 'x', location: 'y' }, ''),
    ).rejects.toThrow(/YELP_API_TOKEN_MISSING/)
  })
})
