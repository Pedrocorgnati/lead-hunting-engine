/**
 * Google Reviews enricher — TASK-5 intake-review (CL-059)
 *
 * Usa Google Places Details API. Requer GOOGLE_PLACES_API_KEY.
 * Se key ausente, retorna { skipped: true } sem quebrar pipeline.
 */

export interface GoogleReviewsResult {
  reviewCount: number | null
  avgRating: number | null
  lowVolume: boolean | null // true se reviewCount < LOW_VOLUME_THRESHOLD
  fetchedAt: string
  skipped?: boolean
  error?: string
}

const PLACES_DETAILS_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/details/json'
const LOW_VOLUME_THRESHOLD = 20

export async function fetchReviews(placeId: string | null | undefined): Promise<GoogleReviewsResult> {
  const base: GoogleReviewsResult = {
    reviewCount: null,
    avgRating: null,
    lowVolume: null,
    fetchedAt: new Date().toISOString(),
  }

  try {
    if (!placeId) return { ...base, skipped: true, error: 'no-place-id' }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    if (!apiKey) {
      // eslint-disable-next-line no-console
      console.warn('[google-reviews] skipped: missing GOOGLE_PLACES_API_KEY — configure in .env')
      return { ...base, skipped: true, error: 'missing-api-key' }
    }

    const url = `${PLACES_DETAILS_ENDPOINT}?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total&key=${apiKey}`
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(to)

    if (!res.ok) return { ...base, error: `http-${res.status}` }

    const json = (await res.json()) as {
      status?: string
      result?: { rating?: number; user_ratings_total?: number }
    }
    if (json.status && json.status !== 'OK') return { ...base, error: `api-${json.status}` }

    const reviewCount = typeof json.result?.user_ratings_total === 'number' ? json.result.user_ratings_total : 0
    const avgRating = typeof json.result?.rating === 'number' ? json.result.rating : null

    return {
      reviewCount,
      avgRating,
      lowVolume: reviewCount < LOW_VOLUME_THRESHOLD,
      fetchedAt: base.fetchedAt,
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : 'google-reviews-failed' }
  }
}
