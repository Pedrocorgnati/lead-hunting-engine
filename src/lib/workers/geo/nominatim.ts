import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import type { GeocodingProvider, GeocodingResult } from './types'

const DEFAULT_BASE_URL = 'https://nominatim.openstreetmap.org'
const USER_AGENT = 'LeadHuntingEngine/1.0 (https://github.com/Pedrocorgnati/lead-hunting-engine)'

function buildBase(apiKey: string): { baseUrl: string; authHeader?: string } {
  if (apiKey.includes('|')) {
    const [url, token] = apiKey.split('|')
    return { baseUrl: url.replace(/\/$/, ''), authHeader: `Bearer ${token}` }
  }
  if (apiKey.startsWith('http://') || apiKey.startsWith('https://')) {
    return { baseUrl: apiKey.replace(/\/$/, '') }
  }
  return { baseUrl: DEFAULT_BASE_URL }
}

interface NominatimItem {
  lat: string
  lon: string
  display_name?: string
  importance?: number
  address?: {
    city?: string
    town?: string
    village?: string
    municipality?: string
    state?: string
    country_code?: string
  }
}

export const NominatimProvider: GeocodingProvider = {
  name: 'nominatim',

  async geocode(address: string, apiKey: string): Promise<GeocodingResult | null> {
    await RateLimiter.wait('nominatim')

    const { baseUrl, authHeader } = buildBase(apiKey)
    const url = `${baseUrl}/search?q=${encodeURIComponent(address)}&format=json&addressdetails=1&limit=1&accept-language=pt-BR`

    const headers: Record<string, string> = { 'User-Agent': USER_AGENT }
    if (authHeader) headers.Authorization = authHeader

    const data = await withRetry(async () => {
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(`Nominatim: HTTP ${res.status}`)
      return res.json() as Promise<NominatimItem[]>
    })

    const item = data?.[0]
    if (!item) return null

    const addr = item.address ?? {}
    const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? null

    return {
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      formattedAddress: item.display_name ?? null,
      city,
      state: addr.state ?? null,
      country: addr.country_code ? addr.country_code.toUpperCase() : null,
      confidence: item.importance != null ? Math.min(item.importance, 1) : 0.4,
    }
  },
}
