import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import { CircuitBreaker } from '../utils/circuit-breaker'
import type { SocialProvider, SocialSearchParams, SocialProfileData } from './types'

const APIFY_BASE = 'https://api.apify.com/v2'
const IG_ACTOR = 'apify/instagram-scraper'

export const IG_FALLBACK_CB_KEY = 'instagram-fallback'

export const InstagramApifyProvider: SocialProvider = {
  name: 'instagram-apify',

  async collect(params: SocialSearchParams, apiKey: string): Promise<SocialProfileData[]> {
    if (!apiKey) throw new Error('APIFY_KEY_MISSING: token nao configurado')

    CircuitBreaker.ensureClosed(IG_FALLBACK_CB_KEY)
    await RateLimiter.wait('apify')

    const handle = params.handle ?? params.query.replace(/^ig:\/\//, '')

    try {
      const runRes = await withRetry(async () => {
        const res = await fetch(`${APIFY_BASE}/acts/${IG_ACTOR}/runs`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernames: [handle], resultsLimit: 1 }),
        })
        if (!res.ok) throw new Error(`Apify IG run start HTTP ${res.status}`)
        return res.json() as Promise<{ data?: { id?: string } }>
      })

      const runId = runRes.data?.id
      if (!runId) throw new Error('Apify IG: falhou ao iniciar run')

      let statusData: { data?: { status?: string; defaultDatasetId?: string } } = {}
      let poll = 0
      do {
        if (poll++ > 30) throw new Error('Apify IG: timeout')
        await new Promise(r => setTimeout(r, 5000))
        const r = await fetch(`${APIFY_BASE}/actor-runs/${runId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        statusData = await r.json() as typeof statusData
      } while (['RUNNING', 'READY'].includes(statusData.data?.status ?? ''))

      if (statusData.data?.status !== 'SUCCEEDED') {
        throw new Error(`Apify IG run status: ${statusData.data?.status}`)
      }

      const dataRes = await fetch(
        `${APIFY_BASE}/datasets/${statusData.data.defaultDatasetId}/items?limit=1`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      )
      const items = (await dataRes.json()) as Array<Record<string, unknown>>

      CircuitBreaker.recordSuccess(IG_FALLBACK_CB_KEY)

      if (!items?.length) return []

      const item = items[0]
      const lastPost = item.latestIgtvVideo ?? item.latestPost
      const lastPostAt = (lastPost as Record<string, unknown> | undefined)?.timestamp
        ? new Date((lastPost as Record<string, unknown>).timestamp as string)
        : null

      return [{
        handle: (item.username as string | null) ?? handle,
        followers: (item.followersCount as number | null) ?? null,
        bio: (item.biography as string | null) ?? null,
        externalLink: (item.externalUrl as string | null) ?? null,
        lastPostAt,
        postsLast30d: null,
        engagementRate: null,
        abandonedSignal: lastPostAt ? (Date.now() - lastPostAt.getTime()) / 86_400_000 > 90 : true,
        source: 'instagram-apify',
        rawJson: item,
      }]
    } catch (err) {
      CircuitBreaker.recordFailure(IG_FALLBACK_CB_KEY)
      throw err
    }
  },
}
