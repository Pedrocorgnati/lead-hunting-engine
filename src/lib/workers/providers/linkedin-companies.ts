import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import type { ScraperProvider, BusinessSearchParams, BusinessResult } from './types'

const LINKEDIN_APIFY_ACTOR = 'curious_coder/linkedin-company-scraper'

interface LinkedInCompanyRaw {
  id?: string | number
  linkedinUrl?: string
  name?: string
  tagline?: string
  websiteUrl?: string
  phone?: string | null
  industry?: string | null
  headquarters?: { city?: string; country?: string; line1?: string } | null
  staffCount?: number | null
  specialities?: string[]
  followerCount?: number | null
}

export const LinkedInCompaniesProvider: ScraperProvider = {
  name: 'linkedin-companies',

  async search(params: BusinessSearchParams, apiKey: string): Promise<BusinessResult[]> {
    if (!apiKey) throw new Error('LINKEDIN_APIFY_TOKEN_MISSING')

    await RateLimiter.wait('linkedin-companies')

    // Intermediary: Apify actor wraps LinkedIn. Fallback se API oficial (Sales Navigator)
    // nao estiver disponivel. Respeita rate-limit + retry-backoff + nunca loga token.
    const runRes = await withRetry(async () => {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${LINKEDIN_APIFY_ACTOR}/runs`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            searchQuery: `${params.query} ${params.location}`,
            maxResults: params.maxResults ?? 25,
            country: 'BR',
          }),
        }
      )
      if (res.status === 401) throw new Error('LINKEDIN_APIFY_TOKEN_MISSING: token invalido')
      if (!res.ok) throw new Error(`LinkedIn Apify start run: HTTP ${res.status}`)
      return res.json() as Promise<{ data?: { id?: string } }>
    })

    const runId = runRes.data?.id
    if (!runId) throw new Error('LinkedIn Apify: falhou ao iniciar run')

    let statusData: { data?: { status?: string; defaultDatasetId?: string } } = {}
    let pollCount = 0
    do {
      if (pollCount++ > 60) throw new Error('LinkedIn Apify: timeout aguardando run')
      await new Promise((r) => setTimeout(r, 5000))
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      statusData = (await statusRes.json()) as typeof statusData
    } while (['RUNNING', 'READY'].includes(statusData.data?.status ?? ''))

    if (statusData.data?.status !== 'SUCCEEDED') {
      throw new Error(`LinkedIn Apify run falhou: ${statusData.data?.status}`)
    }

    const datasetId = statusData.data?.defaultDatasetId
    const limit = params.maxResults ?? 25
    const dataRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?limit=${limit}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    const items = (await dataRes.json()) as LinkedInCompanyRaw[]

    return (items ?? []).map((c): BusinessResult => {
      const city = c.headquarters?.city ?? null
      const address = c.headquarters?.line1 ?? null
      const externalId =
        (c.id != null ? `linkedin-companies:${c.id}` : null) ??
        c.linkedinUrl ??
        `linkedin-companies:${(c.name ?? '').slice(0, 100)}`
      return {
        externalId,
        name: c.name ?? '',
        address,
        city,
        state: null,
        phone: c.phone ?? null,
        website: c.websiteUrl ?? null,
        category: c.industry ?? null,
        rating: null,
        reviewCount: c.followerCount ?? null,
        lat: null,
        lng: null,
        openNow: null,
        priceLevel: null,
        source: 'linkedin-companies',
        rawJson: {
          linkedinUrl: c.linkedinUrl,
          staffCount: c.staffCount ?? null,
          specialities: c.specialities ?? [],
          tagline: c.tagline ?? null,
        },
      }
    })
  },
}
