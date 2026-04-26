import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import type { SocialProvider, SocialSearchParams, SocialProfileData } from './types'

const IG_API_BASE = 'https://graph.facebook.com/v19.0'
const ABANDONED_DAYS = 90

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

export const InstagramGraphProvider: SocialProvider = {
  name: 'instagram-graph',

  async collect(params: SocialSearchParams, apiKey: string): Promise<SocialProfileData[]> {
    if (!apiKey) throw new Error('INSTAGRAM_TOKEN_MISSING: token nao configurado')

    await RateLimiter.wait('instagram-graph')

    // Business Discovery API: requires an IG Business Account linked to the token
    const handle = params.handle ?? params.query.replace(/^ig:\/\//, '')

    const url = new URL(`${IG_API_BASE}/me`)
    url.searchParams.set('fields', `business_discovery.fields(username,followers_count,biography,website,media_count,media{timestamp})`)
    url.searchParams.set('access_token', apiKey)

    const raw = await withRetry(async () => {
      const res = await fetch(url.toString())
      if (res.status === 401) throw new Error('INSTAGRAM_TOKEN_MISSING: token invalido ou expirado')
      if (!res.ok) throw new Error(`Instagram Graph API HTTP ${res.status}`)
      return res.json() as Promise<Record<string, unknown>>
    })

    const discovery = (raw.business_discovery ?? {}) as Record<string, unknown>
    if (!discovery.username) return []

    const media = (discovery.media as { data?: Array<{ timestamp?: string }> } | undefined)?.data ?? []
    const lastTimestamp = media[0]?.timestamp ? new Date(media[0].timestamp) : null
    const postsLast30d = media.filter(m => {
      if (!m.timestamp) return false
      return daysSince(new Date(m.timestamp)) <= 30
    }).length

    const abandoned = lastTimestamp ? daysSince(lastTimestamp) > ABANDONED_DAYS : true

    return [{
      handle: (discovery.username as string | null) ?? handle,
      followers: (discovery.followers_count as number | null) ?? null,
      bio: (discovery.biography as string | null) ?? null,
      externalLink: (discovery.website as string | null) ?? null,
      lastPostAt: lastTimestamp,
      postsLast30d,
      engagementRate: null,
      abandonedSignal: abandoned,
      source: 'instagram-graph',
      rawJson: raw,
    }]
  },
}
