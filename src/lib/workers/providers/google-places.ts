import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import type { ScraperProvider, BusinessSearchParams, BusinessResult } from './types'

const GP_BASE = 'https://maps.googleapis.com/maps/api'

export const GooglePlacesProvider: ScraperProvider = {
  name: 'google-places',

  async search(params: BusinessSearchParams, apiKey: string): Promise<BusinessResult[]> {
    const results: BusinessResult[] = []
    let nextPageToken: string | undefined

    do {
      await RateLimiter.wait('google-places')

      const url = new URL(`${GP_BASE}/place/textsearch/json`)
      url.searchParams.set('query', `${params.query} ${params.location}`)
      url.searchParams.set('key', apiKey)
      url.searchParams.set('language', 'pt-BR')
      if (params.radius) url.searchParams.set('radius', params.radius.toString())
      if (nextPageToken) url.searchParams.set('pagetoken', nextPageToken)

      const data = await withRetry(async () => {
        const res = await fetch(url.toString())
        if (!res.ok) throw new Error(`Google Places: HTTP ${res.status}`)
        return res.json() as Promise<Record<string, unknown>>
      })

      if (data.status === 'REQUEST_DENIED') {
        throw new Error('Google Places: REQUEST_DENIED — verifique a chave de API')
      }
      if (data.status === 'OVER_QUERY_LIMIT') {
        throw new Error('Google Places: OVER_QUERY_LIMIT — limite de quota atingido')
      }

      for (const place of ((data.results as Record<string, unknown>[]) ?? [])) {
        results.push(mapGooglePlace(place))
      }

      nextPageToken = data.next_page_token as string | undefined
      // Google exige 2s de espera antes do próximo page token
      if (nextPageToken) await new Promise(r => setTimeout(r, 2000))

    } while (nextPageToken && results.length < (params.maxResults ?? 500))

    return results.slice(0, params.maxResults ?? 500)
  },
}

function mapGooglePlace(place: Record<string, unknown>): BusinessResult {
  const geometry = place.geometry as Record<string, unknown> | undefined
  const location = geometry?.location as Record<string, unknown> | undefined
  const openingHours = place.opening_hours as Record<string, unknown> | undefined

  return {
    externalId: place.place_id as string,
    name: place.name as string,
    address: (place.formatted_address as string) ?? null,
    city: extractCity(place.formatted_address as string | null),
    state: extractState(place.formatted_address as string | null),
    phone: null, // TextSearch não retorna phone — disponível via Place Details
    website: null,
    category: ((place.types as string[])?.[0]?.replace(/_/g, ' ')) ?? null,
    rating: (place.rating as number) ?? null,
    reviewCount: (place.user_ratings_total as number) ?? null,
    lat: (location?.lat as number) ?? null,
    lng: (location?.lng as number) ?? null,
    openNow: (openingHours?.open_now as boolean) ?? null,
    priceLevel: (place.price_level as number) ?? null,
    source: 'google-places',
    rawJson: place,
  }
}

function extractCity(address: string | null): string | null {
  if (!address) return null
  const parts = address.split(',').map(p => p.trim())
  // Formato BR: "Rua X, 123 - Bairro, Cidade - UF, CEP, Brasil"
  for (const part of parts) {
    const match = part.match(/^(.+?)\s*-\s*[A-Z]{2}$/)
    if (match) return match[1].trim()
  }
  // Fallback: penúltima parte antes do país
  return parts.length >= 3 ? parts[parts.length - 3]?.trim() ?? null : null
}

function extractState(address: string | null): string | null {
  if (!address) return null
  // Formato BR: "Cidade - UF" ou "Cidade - UF, CEP-XXX"
  const brMatch = address.match(/\b([A-Z]{2})\b(?:\s*,\s*\d{5}-?\d{3})?/)
  if (brMatch) return brMatch[1]
  // Fallback US: "ST 12345"
  const usMatch = address.match(/,\s*([A-Z]{2})\s*\d{5}/)
  return usMatch?.[1] ?? null
}
