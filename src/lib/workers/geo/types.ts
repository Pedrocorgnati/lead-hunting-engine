export interface GeocodingResult {
  lat: number
  lng: number
  formattedAddress: string | null
  city: string | null
  state: string | null
  country: string | null
  confidence: number // 0-1
}

export interface GeocodingProvider {
  name: string
  geocode(address: string, apiKey: string): Promise<GeocodingResult | null>
}
