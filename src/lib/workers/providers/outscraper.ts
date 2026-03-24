import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import type { ScraperProvider, BusinessSearchParams, BusinessResult } from './types'

export const OutscraperProvider: ScraperProvider = {
  name: 'outscraper',

  async search(params: BusinessSearchParams, apiKey: string): Promise<BusinessResult[]> {
    await RateLimiter.wait('outscraper')

    const query = encodeURIComponent(`${params.query} ${params.location}`)
    const limit = params.maxResults ?? 100
    const url = `https://api.outscraper.com/maps/search-v3?query=${query}&limit=${limit}&language=pt`

    const data = await withRetry(async () => {
      const res = await fetch(url, {
        headers: { 'X-API-KEY': apiKey },
      })
      if (res.status === 429) throw new Error('429 rate limit')
      if (!res.ok) throw new Error(`Outscraper: HTTP ${res.status}`)
      return res.json() as Promise<Record<string, unknown>>
    })

    const businesses = (data.data as Record<string, unknown>[][])?.[0] ?? []

    return businesses.map((b: Record<string, unknown>): BusinessResult => ({
      externalId: (b.place_id ?? b.google_id ?? `outscraper:${((b.name as string) ?? '').slice(0, 100)}:${((b.full_address as string) ?? '').slice(0, 100)}`) as string,
      name: b.name as string,
      address: (b.full_address as string) ?? null,
      city: (b.city as string) ?? null,
      state: (b.state as string) ?? null,
      phone: (b.phone as string) ?? null,
      website: (b.site as string) ?? null,
      category: ((b.type ?? (b.subtypes as string[])?.[0]) as string) ?? null,
      rating: (b.rating as number) ?? null,
      reviewCount: (b.reviews as number) ?? null,
      lat: (b.latitude as number) ?? null,
      lng: (b.longitude as number) ?? null,
      openNow: null,
      priceLevel: null,
      source: 'outscraper',
      rawJson: b,
    }))
  },
}
