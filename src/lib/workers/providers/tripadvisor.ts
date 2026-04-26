import { kvGet, kvSet } from '@/lib/cache/kv-cache'

/**
 * TripAdvisor Provider — rating, reviews e foto principal de negocios turisticos/restaurantes.
 *
 * STUB: TripAdvisor Content API e paga (https://developer-tripadvisor.com)
 * e scraping viola ToS + Cloudflare. Requer TRIPADVISOR_API_KEY env para real.
 *
 * Ver PENDING-ACTIONS.md secao "TASK-11 providers secundarios".
 */

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias
const API_BASE = process.env.TRIPADVISOR_API_BASE ?? 'https://api.content.tripadvisor.com/api/v1'

export interface TripAdvisorData {
  locationId: string
  name: string
  rating: number | null // 0-5
  numReviews: number | null
  rankingText: string | null
  photoUrl: string | null
  webUrl: string | null
}

interface TripAdvisorLocationSearchResponse {
  data?: Array<{ location_id: string; name: string }>
}

interface TripAdvisorLocationDetailsResponse {
  location_id: string
  name: string
  rating?: string
  num_reviews?: string
  ranking_data?: { ranking_string?: string }
  web_url?: string
}

export async function queryTripAdvisor(query: string, location?: string): Promise<TripAdvisorData | null> {
  const q = query.trim()
  if (!q) return null

  const apiKey = process.env.TRIPADVISOR_API_KEY
  if (!apiKey) {
    console.warn('[tripadvisor] skipped: requires TRIPADVISOR_API_KEY env')
    return null
  }

  const cacheKey = `tripadvisor:${q.toLowerCase()}:${(location ?? '').toLowerCase()}`
  const cached = await kvGet<TripAdvisorData>(cacheKey)
  if (cached) return cached

  try {
    const url = new URL(`${API_BASE}/location/search`)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('searchQuery', q)
    if (location) url.searchParams.set('address', location)
    url.searchParams.set('language', 'pt_BR')

    const searchRes = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
    if (!searchRes.ok) {
      console.warn(`[tripadvisor] search status ${searchRes.status}`)
      return null
    }
    const search = await searchRes.json() as TripAdvisorLocationSearchResponse
    const first = search.data?.[0]
    if (!first) return null

    const detailsUrl = new URL(`${API_BASE}/location/${first.location_id}/details`)
    detailsUrl.searchParams.set('key', apiKey)
    detailsUrl.searchParams.set('language', 'pt_BR')
    const detailsRes = await fetch(detailsUrl.toString(), { signal: AbortSignal.timeout(15_000) })
    if (!detailsRes.ok) {
      console.warn(`[tripadvisor] details status ${detailsRes.status}`)
      return null
    }
    const det = await detailsRes.json() as TripAdvisorLocationDetailsResponse

    const data: TripAdvisorData = {
      locationId: det.location_id,
      name: det.name,
      rating: det.rating ? Number(det.rating) : null,
      numReviews: det.num_reviews ? Number(det.num_reviews) : null,
      rankingText: det.ranking_data?.ranking_string ?? null,
      photoUrl: null, // endpoint /photos pago; mantemos null no stub
      webUrl: det.web_url ?? null,
    }
    await kvSet(cacheKey, data, CACHE_TTL_MS)
    return data
  } catch (e) {
    console.warn('[tripadvisor] erro:', (e as Error).message)
    return null
  }
}
