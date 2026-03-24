import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import type { ScraperProvider, BusinessSearchParams, BusinessResult } from './types'

const APIFY_GOOGLE_MAPS_ACTOR = 'compass/crawler-google-places'

export const ApifyProvider: ScraperProvider = {
  name: 'apify',

  async search(params: BusinessSearchParams, apiKey: string): Promise<BusinessResult[]> {
    await RateLimiter.wait('apify')

    // 1. Iniciar run do actor
    const runRes = await withRetry(async () => {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${APIFY_GOOGLE_MAPS_ACTOR}/runs`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            searchStringsArray: [`${params.query} ${params.location}`],
            maxCrawledPlacesPerSearch: params.maxResults ?? 100,
            language: 'pt',
          }),
        }
      )
      if (!res.ok) throw new Error(`Apify start run: HTTP ${res.status}`)
      return res.json() as Promise<{ data?: { id?: string } }>
    })

    const runId = runRes.data?.id
    if (!runId) throw new Error('Apify: falhou ao iniciar run')

    // 2. Aguardar conclusão com guardrail: max 60 iterações = 5 min
    let statusData: { data?: { status?: string; defaultDatasetId?: string } } = {}
    let pollCount = 0
    do {
      if (pollCount++ > 60) throw new Error('Apify: timeout aguardando conclusão do run')
      await new Promise(r => setTimeout(r, 5000))

      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      )
      statusData = await statusRes.json() as typeof statusData
    } while (['RUNNING', 'READY'].includes(statusData.data?.status ?? ''))

    if (statusData.data?.status !== 'SUCCEEDED') {
      throw new Error(`Apify run falhou com status: ${statusData.data?.status}`)
    }

    // 3. Buscar dataset
    const datasetId = statusData.data?.defaultDatasetId
    const limit = params.maxResults ?? 100
    const dataRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?limit=${limit}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    const items = await dataRes.json() as Record<string, unknown>[]

    return (items ?? []).map((b: Record<string, unknown>): BusinessResult => {
      const location = b.location as Record<string, unknown> | undefined
      return {
        externalId: (b.placeId ?? b.url ?? `apify:${((b.title as string) ?? '').slice(0, 100)}:${((b.address as string) ?? '').slice(0, 100)}`) as string,
        name: b.title as string,
        address: (b.address as string) ?? null,
        city: (b.city as string) ?? null,
        state: (b.state as string) ?? null,
        phone: (b.phone as string) ?? null,
        website: (b.website as string) ?? null,
        category: (b.categoryName as string) ?? null,
        rating: (b.totalScore as number) ?? null,
        reviewCount: (b.reviewsCount as number) ?? null,
        lat: (location?.lat as number) ?? null,
        lng: (location?.lng as number) ?? null,
        openNow: null,
        priceLevel: typeof b.price === 'string' ? (b.price as string).length : null,
        source: 'apify',
        rawJson: b,
      }
    })
  },
}
