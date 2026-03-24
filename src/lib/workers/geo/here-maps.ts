import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import type { GeocodingProvider, GeocodingResult } from './types'

export const HereMapsProvider: GeocodingProvider = {
  name: 'here-maps',

  async geocode(address: string, apiKey: string): Promise<GeocodingResult | null> {
    await RateLimiter.wait('here-maps')

    const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apiKey=${apiKey}&lang=pt-BR&limit=1`

    const data = await withRetry(async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HERE Maps: HTTP ${res.status}`)
      return res.json() as Promise<{ items?: Record<string, unknown>[] }>
    })

    const item = data.items?.[0]
    if (!item) return null

    const position = item.position as { lat: number; lng: number } | undefined
    const addr = item.address as Record<string, unknown> | undefined
    const scoring = item.scoring as Record<string, unknown> | undefined

    if (!position) return null

    return {
      lat: position.lat,
      lng: position.lng,
      formattedAddress: (addr?.label as string) ?? null,
      city: (addr?.city as string) ?? null,
      state: (addr?.state as string) ?? null,
      country: (addr?.countryCode as string) ?? null,
      confidence: (scoring?.queryScore as number) ?? 0.5,
    }
  },
}
