import { NominatimProvider } from '../nominatim'
import { OvertureMapsProvider } from '../overture-maps'

jest.mock('../../utils/rate-limiter', () => ({
  RateLimiter: { wait: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('../../utils/retry-backoff', () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
}))

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  fetchMock.mockReset()
})

describe('NominatimProvider', () => {
  it('decodes a successful response from OSM public server', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          lat: '-23.55',
          lon: '-46.63',
          display_name: 'Sao Paulo, SP, Brasil',
          importance: 0.8,
          address: { city: 'Sao Paulo', state: 'Sao Paulo', country_code: 'br' },
        },
      ],
    })

    const result = await NominatimProvider.geocode('Sao Paulo', '')

    expect(result).toEqual({
      lat: -23.55,
      lng: -46.63,
      formattedAddress: 'Sao Paulo, SP, Brasil',
      city: 'Sao Paulo',
      state: 'Sao Paulo',
      country: 'BR',
      confidence: 0.8,
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('https://nominatim.openstreetmap.org/search')
    expect(init.headers['User-Agent']).toMatch(/LeadHuntingEngine/)
  })

  it('uses self-hosted URL when credential is a URL', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] })

    await NominatimProvider.geocode('test', 'https://nominatim.internal.local')

    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/nominatim\.internal\.local\/search/)
  })

  it('adds bearer header when credential includes token', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] })

    await NominatimProvider.geocode('test', 'https://geo.example.com|secret123')

    const init = fetchMock.mock.calls[0][1]
    expect(init.headers.Authorization).toBe('Bearer secret123')
  })

  it('returns null when response is empty', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] })
    const result = await NominatimProvider.geocode('', '')
    expect(result).toBeNull()
  })

  it('falls back to town when city missing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { lat: '1', lon: '2', address: { town: 'Pequeno Povoado' } },
      ],
    })

    const result = await NominatimProvider.geocode('povoado', '')
    expect(result?.city).toBe('Pequeno Povoado')
  })

  it('throws on HTTP error so retry-backoff can handle it', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(NominatimProvider.geocode('x', '')).rejects.toThrow(/HTTP 503/)
  })
})

describe('OvertureMapsProvider', () => {
  it('returns null when credential is empty', async () => {
    const result = await OvertureMapsProvider.geocode('x', '')
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null when credential is not a URL', async () => {
    const result = await OvertureMapsProvider.geocode('x', 'not-a-url')
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('decodes a successful response and maps coords [lng,lat] → {lat,lng}', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [-46.63, -23.55] },
            properties: {
              formatted_address: 'Sao Paulo, BR',
              city: 'Sao Paulo',
              state: 'SP',
              country: 'BR',
              confidence: 0.9,
            },
          },
        ],
      }),
    })

    const result = await OvertureMapsProvider.geocode('sp', 'https://overture.example.com')

    expect(result).toEqual({
      lat: -23.55,
      lng: -46.63,
      formattedAddress: 'Sao Paulo, BR',
      city: 'Sao Paulo',
      state: 'SP',
      country: 'BR',
      confidence: 0.9,
    })
  })

  it('forwards bearer token when provided via URL|token', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) })

    await OvertureMapsProvider.geocode('x', 'https://o.example|abc')

    const init = fetchMock.mock.calls[0][1]
    expect(init.headers.Authorization).toBe('Bearer abc')
  })
})
