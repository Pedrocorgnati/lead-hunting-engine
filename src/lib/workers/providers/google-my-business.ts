import { kvGet, kvSet } from '@/lib/cache/kv-cache'

/**
 * Google My Business Provider — horario, fotos, categorias via Google Places Details API.
 *
 * Usa Google Places Details (nao a GMB API que requer ownership).
 * Requer env GOOGLE_PLACES_API_KEY. Sem key → retorna null com warn.
 *
 * Ref: https://developers.google.com/maps/documentation/places/web-service/details
 */

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias
const PLACES_BASE = process.env.GOOGLE_PLACES_BASE ?? 'https://maps.googleapis.com/maps/api/place'

export interface GmbData {
  placeId: string
  name: string
  hours: string[] | null // weekday_text do Places
  photos: string[] | null // photo reference strings
  categories: string[] | null // types
  phone: string | null
  website: string | null
  rating: number | null
  userRatingsTotal: number | null
  googleMapsUrl: string | null
}

interface PlaceDetailsResponse {
  result?: {
    place_id?: string
    name?: string
    formatted_phone_number?: string
    international_phone_number?: string
    website?: string
    rating?: number
    user_ratings_total?: number
    url?: string
    types?: string[]
    opening_hours?: { weekday_text?: string[] }
    photos?: Array<{ photo_reference: string }>
  }
  status: string
}

export async function fetchGmb(placeId: string): Promise<GmbData | null> {
  const id = placeId.trim()
  if (!id) return null

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.warn('[google-my-business] skipped: requires GOOGLE_PLACES_API_KEY env')
    return null
  }

  const cacheKey = `gmb:${id}`
  const cached = await kvGet<GmbData>(cacheKey)
  if (cached) return cached

  try {
    const url = new URL(`${PLACES_BASE}/details/json`)
    url.searchParams.set('place_id', id)
    url.searchParams.set('language', 'pt-BR')
    url.searchParams.set('fields', [
      'place_id', 'name', 'formatted_phone_number', 'international_phone_number',
      'website', 'rating', 'user_ratings_total', 'url', 'types',
      'opening_hours/weekday_text', 'photos',
    ].join(','))
    url.searchParams.set('key', apiKey)

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      console.warn(`[google-my-business] status ${res.status}`)
      return null
    }
    const json = await res.json() as PlaceDetailsResponse
    if (json.status !== 'OK' || !json.result) {
      console.warn(`[google-my-business] status google=${json.status}`)
      return null
    }
    const r = json.result
    const data: GmbData = {
      placeId: r.place_id ?? id,
      name: r.name ?? '',
      hours: r.opening_hours?.weekday_text ?? null,
      photos: r.photos?.map((p) => p.photo_reference) ?? null,
      categories: r.types ?? null,
      phone: r.international_phone_number ?? r.formatted_phone_number ?? null,
      website: r.website ?? null,
      rating: typeof r.rating === 'number' ? r.rating : null,
      userRatingsTotal: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
      googleMapsUrl: r.url ?? null,
    }
    await kvSet(cacheKey, data, CACHE_TTL_MS)
    return data
  } catch (e) {
    console.warn('[google-my-business] erro:', (e as Error).message)
    return null
  }
}
