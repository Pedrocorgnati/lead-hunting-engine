import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import type { GeocodingProvider, GeocodingResult } from './types'

export const TomTomProvider: GeocodingProvider = {
  name: 'tomtom',

  async geocode(address: string, apiKey: string): Promise<GeocodingResult | null> {
    await RateLimiter.wait('tomtom')

    const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(address)}.json?key=${apiKey}&language=pt-BR&limit=1`

    const data = await withRetry(async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`TomTom: HTTP ${res.status}`)
      return res.json() as Promise<{ results?: Record<string, unknown>[] }>
    })

    const result = data.results?.[0]
    if (!result) return null

    const position = result.position as { lat: number; lon: number } | undefined
    const addr = result.address as Record<string, unknown> | undefined

    if (!position) return null

    const score = result.score as number | undefined

    return {
      lat: position.lat,
      lng: position.lon,
      formattedAddress: (addr?.freeformAddress as string) ?? null,
      city: (addr?.municipality as string) ?? null,
      state: (addr?.countrySubdivision as string) ?? null,
      country: (addr?.countryCode as string) ?? null,
      confidence: score != null ? Math.min(score / 10, 1) : 0.5,
    }
  },
}
