import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import { analyzeEngagement } from './facebook-graph'
import type { SocialProvider, SocialSearchParams, SocialProfileData } from './types'

const APIFY_BASE = 'https://api.apify.com/v2'
const FB_ACTOR = 'apify/facebook-pages-scraper'

export const FacebookIntermediaryProvider: SocialProvider = {
  name: 'facebook-intermediary',

  async collect(params: SocialSearchParams, apiKey: string): Promise<SocialProfileData[]> {
    if (!apiKey) throw new Error('APIFY_KEY_MISSING: token nao configurado')

    await RateLimiter.wait('apify')

    const runRes = await withRetry(async () => {
      const res = await fetch(`${APIFY_BASE}/acts/${FB_ACTOR}/runs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrls: [], searchQuery: params.query, maxPagesPerSearch: 1 }),
      })
      if (!res.ok) throw new Error(`Apify FB run start HTTP ${res.status}`)
      return res.json() as Promise<{ data?: { id?: string } }>
    })

    const runId = runRes.data?.id
    if (!runId) throw new Error('Apify FB: falhou ao iniciar run')

    let statusData: { data?: { status?: string; defaultDatasetId?: string } } = {}
    let poll = 0
    do {
      if (poll++ > 30) throw new Error('Apify FB: timeout')
      await new Promise(r => setTimeout(r, 5000))
      const r = await fetch(`${APIFY_BASE}/actor-runs/${runId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      statusData = await r.json() as typeof statusData
    } while (['RUNNING', 'READY'].includes(statusData.data?.status ?? ''))

    if (statusData.data?.status !== 'SUCCEEDED') {
      throw new Error(`Apify FB run status: ${statusData.data?.status}`)
    }

    const dataRes = await fetch(
      `${APIFY_BASE}/datasets/${statusData.data.defaultDatasetId}/items?limit=1`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    const items = (await dataRes.json()) as Array<Record<string, unknown>>
    if (!items?.length) return []

    const item = items[0]
    const fanCount = (item.likes as number) ?? (item.followers as number) ?? 0
    const posts = ((item.posts as Array<Record<string, unknown>>) ?? []).map(p => ({
      created_time: p.date as string | undefined,
      likes: { summary: { total_count: (p.likes as number) ?? 0 } },
    }))

    const { engagementRate, lastPostAt, abandonedSignal } = analyzeEngagement({
      fan_count: fanCount,
      posts: posts.slice(0, 10),
    })

    return [{
      handle: (item.username as string | null) ?? (item.name as string | null),
      followers: fanCount,
      bio: (item.about as string | null) ?? null,
      externalLink: (item.website as string | null) ?? null,
      lastPostAt,
      postsLast30d: null,
      engagementRate,
      abandonedSignal,
      source: 'facebook-intermediary',
      rawJson: item,
    }]
  },
}
