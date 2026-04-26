import { logApiUsage } from '@/lib/observability/api-usage-logger'
import { getApiKey } from '../utils/get-credential'
import { HereMapsProvider } from './here-maps'
import { NominatimProvider } from './nominatim'
import { OvertureMapsProvider } from './overture-maps'
import { TomTomProvider } from './tomtom'
import type { GeocodingResult } from './types'

const GEO_PROVIDERS = [
  HereMapsProvider,
  TomTomProvider,
  OvertureMapsProvider,
  NominatimProvider,
]

/**
 * Geocodifica um endereço em cascata: HERE Maps → TomTom → Overture → Nominatim.
 * Retorna null se nenhum provider funcionar (geocoding é best-effort — não bloqueia coleta).
 * CONFIG_080: providers sem credencial são pulados silenciosamente.
 * SYS_001: erros de provider são capturados, não propagados.
 *
 * Nominatim aceita credencial vazia via fallback para OSM public (1 req/s).
 * Overture só atua se credencial apontar para URL http(s) configurada.
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  for (const provider of GEO_PROVIDERS) {
    const apiKey = await getApiKey(provider.name)
    const effectiveKey = apiKey ?? (provider.name === 'nominatim' ? '' : null)
    if (effectiveKey === null) continue

    try {
      const result = await provider.geocode(address, effectiveKey)
      void logApiUsage({
        provider: provider.name,
        callType: 'geocode',
        metadata: { hit: !!result, confidence: result?.confidence ?? null },
      })
      if (result) return result
    } catch {
      // Captura silenciosamente — tenta próximo provider
    }
  }
  return null
}
