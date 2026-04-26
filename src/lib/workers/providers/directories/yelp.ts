import { RateLimiter } from '../../utils/rate-limiter'
import { withRetry } from '../../utils/retry-backoff'
import type { ScraperProvider, BusinessSearchParams, BusinessResult } from '../types'

/**
 * Yelp Fusion API provider (API-first). Yelp explicitamente proibe scraping
 * por TOS — se nao houver token, NAO fazemos fallback para scraping neste
 * diretorio (o searchBusinessesYelp em provider-manager mantem o fallback
 * headless como opcao opt-in, governada por flag administrativa).
 */

const YELP_BASE = 'https://api.yelp.com/v3/businesses/search'

interface YelpRawBusiness {
  id?: string
  name?: string
  location?: {
    address1?: string | null
    city?: string | null
    state?: string | null
    display_address?: string[]
  } | null
  phone?: string | null
  display_phone?: string | null
  url?: string | null
  rating?: number | null
  review_count?: number | null
  coordinates?: { latitude?: number | null; longitude?: number | null } | null
  is_closed?: boolean | null
  price?: string | null
  categories?: Array<{ alias?: string; title?: string }> | null
}

function priceToLevel(price: string | null | undefined): number | null {
  if (!price) return null
  return price.length // "$" => 1, "$$" => 2, etc.
}

export const YelpApiProvider: ScraperProvider = {
  name: 'yelp-api',

  async search(params: BusinessSearchParams, apiKey: string): Promise<BusinessResult[]> {
    if (!apiKey) throw new Error('YELP_API_TOKEN_MISSING')

    await RateLimiter.wait('yelp-api')

    const url = new URL(YELP_BASE)
    url.searchParams.set('term', params.query)
    url.searchParams.set('location', params.location)
    if (params.radius) url.searchParams.set('radius', String(Math.min(params.radius, 40000)))
    url.searchParams.set('limit', String(Math.min(params.maxResults ?? 20, 50)))

    const json = await withRetry(async () => {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (res.status === 401) throw new Error('YELP_API_TOKEN_MISSING: token invalido ou revogado')
      if (res.status === 429) throw new Error('YELP_API_RATE_LIMITED')
      if (!res.ok) throw new Error(`Yelp API HTTP ${res.status}`)
      return res.json() as Promise<{ businesses?: YelpRawBusiness[] }>
    })

    const items = json.businesses ?? []

    return items.map((b): BusinessResult => {
      const addressLines = b.location?.display_address ?? []
      const address = b.location?.address1 ?? addressLines.join(', ') ?? null
      const externalId = b.id ? `yelp-api:${b.id}` : `yelp-api:${b.name ?? ''}:${address ?? ''}`
      return {
        externalId,
        name: b.name ?? '',
        address,
        city: b.location?.city ?? null,
        state: b.location?.state ?? null,
        phone: b.phone ?? b.display_phone ?? null,
        website: b.url ?? null,
        category: b.categories?.[0]?.title ?? null,
        rating: b.rating ?? null,
        reviewCount: b.review_count ?? null,
        lat: b.coordinates?.latitude ?? null,
        lng: b.coordinates?.longitude ?? null,
        openNow: b.is_closed == null ? null : !b.is_closed,
        priceLevel: priceToLevel(b.price),
        source: 'yelp-api',
        rawJson: {
          yelpId: b.id,
          categories: b.categories ?? [],
          displayPhone: b.display_phone ?? null,
          price: b.price ?? null,
        },
      }
    })
  },
}
