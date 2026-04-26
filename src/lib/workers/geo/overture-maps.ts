import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import type { GeocodingProvider, GeocodingResult } from './types'

/**
 * Overture Maps provider.
 *
 * Overture Maps publica datasets em Parquet via S3 (overturemaps-us-west-2).
 * Consulta direta em parquet exige DuckDB/Athena; para manter custo baixo
 * aqui usamos um endpoint HTTP intermediario configurado por `apiKey` no
 * formato `{base_url}|{optional_token}` (ex.: self-hosted via pmtiles ou
 * API compativel com Nominatim expondo Overture places/addresses).
 *
 * apiKey pode ser:
 *   - URL http(s) (sem token)
 *   - "URL|token" (com bearer)
 *
 * Se nenhuma URL for fornecida, este provider retorna null (best-effort).
 */

interface OvertureFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    formatted_address?: string
    display_name?: string
    locality?: string
    city?: string
    region?: string
    state?: string
    country?: string
    confidence?: number
  }
}

interface OvertureResponse {
  features?: OvertureFeature[]
}

export const OvertureMapsProvider: GeocodingProvider = {
  name: 'overture-maps',

  async geocode(address: string, apiKey: string): Promise<GeocodingResult | null> {
    if (!apiKey || !apiKey.startsWith('http')) return null

    await RateLimiter.wait('overture-maps')

    const [rawBase, token] = apiKey.split('|')
    const base = rawBase.replace(/\/$/, '')
    const url = `${base}/geocode?q=${encodeURIComponent(address)}&limit=1`

    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    const data = await withRetry(async () => {
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(`Overture: HTTP ${res.status}`)
      return res.json() as Promise<OvertureResponse>
    })

    const feature = data?.features?.[0]
    const coords = feature?.geometry?.coordinates
    if (!feature || !coords || coords.length < 2) return null

    const props = feature.properties ?? {}

    return {
      lat: coords[1],
      lng: coords[0],
      formattedAddress: props.formatted_address ?? props.display_name ?? null,
      city: props.city ?? props.locality ?? null,
      state: props.state ?? props.region ?? null,
      country: props.country ?? null,
      confidence: typeof props.confidence === 'number' ? props.confidence : 0.5,
    }
  },
}
