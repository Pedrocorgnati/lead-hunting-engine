import { getApiKey } from '../utils/get-credential'
import { HereMapsProvider } from './here-maps'
import { TomTomProvider } from './tomtom'
import type { GeocodingResult } from './types'

const GEO_PROVIDERS = [HereMapsProvider, TomTomProvider]

/**
 * Geocodifica um endereço em cascata: HERE Maps → TomTom.
 * Retorna null se nenhum provider funcionar (geocoding é best-effort — não bloqueia coleta).
 * CONFIG_080: providers sem credencial são pulados silenciosamente.
 * SYS_001: erros de provider são capturados, não propagados.
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  for (const provider of GEO_PROVIDERS) {
    const apiKey = await getApiKey(provider.name)
    if (!apiKey) continue

    try {
      const result = await provider.geocode(address, apiKey)
      if (result) return result
    } catch {
      // Captura silenciosamente — tenta próximo provider
    }
  }
  return null
}
