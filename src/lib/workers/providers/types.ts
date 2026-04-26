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

// ─── Social Providers ────────────────────────────────────────────────────────

export interface SocialSearchParams {
  query: string
  location?: string
  /** Direct handle override — skip search, fetch profile by handle */
  handle?: string
}

export interface SocialProfileData {
  handle: string | null
  followers: number | null
  bio: string | null
  externalLink: string | null
  lastPostAt: Date | null
  postsLast30d: number | null
  engagementRate: number | null
  /** True when page/account shows signs of abandonment */
  abandonedSignal: boolean
  source: string
  rawJson: Record<string, unknown>
}

export interface SocialProvider {
  name: string
  collect(params: SocialSearchParams, apiKey: string): Promise<SocialProfileData[]>
}
