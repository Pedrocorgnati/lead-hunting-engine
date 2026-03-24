export interface BusinessSearchParams {
  query: string
  location: string
  radius?: number
  maxResults?: number
}

export interface BusinessResult {
  externalId: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  phone: string | null
  website: string | null
  category: string | null
  rating: number | null
  reviewCount: number | null
  lat: number | null
  lng: number | null
  openNow: boolean | null
  priceLevel: number | null
  /** Provider slug: 'google-places' | 'outscraper' | 'apify' */
  source: string
  rawJson: Record<string, unknown>
}

export interface ScraperProvider {
  name: string
  search(params: BusinessSearchParams, apiKey: string): Promise<BusinessResult[]>
}
