import { RateLimiter } from '../utils/rate-limiter'
import { withRetry } from '../utils/retry-backoff'
import type { SocialProvider, SocialSearchParams, SocialProfileData } from './types'

const FB_API_BASE = 'https://graph.facebook.com/v19.0'
const ABANDONED_DAYS = 180
const LOW_ENGAGEMENT_THRESHOLD = 0.001 // 0.1%

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

interface FbPost {
  created_time?: string
  likes?: { summary?: { total_count?: number } }
}

interface EngagementInput {
  fan_count: number
  posts: FbPost[]
}

export function analyzeEngagement(data: EngagementInput): {
  engagementRate: number
  lastPostAt: Date | null
  abandonedSignal: boolean
} {
  const posts = data.posts ?? []
  const lastPostAt = posts[0]?.created_time ? new Date(posts[0].created_time) : null
  const abandonedByDate = lastPostAt ? daysSince(lastPostAt) > ABANDONED_DAYS : true

  const avgLikes =
    posts.length > 0
      ? posts.reduce((sum, p) => sum + (p.likes?.summary?.total_count ?? 0), 0) / posts.length
      : 0
  const engagementRate = data.fan_count > 0 ? avgLikes / data.fan_count : 0
  const abandonedByEngagement = engagementRate < LOW_ENGAGEMENT_THRESHOLD

  return {
    engagementRate,
    lastPostAt,
    abandonedSignal: abandonedByDate || abandonedByEngagement,
  }
}

export const FacebookGraphProvider: SocialProvider = {
  name: 'facebook-graph',

  async collect(params: SocialSearchParams, apiKey: string): Promise<SocialProfileData[]> {
    if (!apiKey) throw new Error('FACEBOOK_TOKEN_MISSING: token nao configurado')

    await RateLimiter.wait('facebook-graph')

    // Search pages by name
    const searchUrl = new URL(`${FB_API_BASE}/pages/search`)
    searchUrl.searchParams.set('q', params.query)
    searchUrl.searchParams.set('fields', 'id,name,website,fan_count,about')
    searchUrl.searchParams.set('access_token', apiKey)

    const searchRaw = await withRetry(async () => {
      const res = await fetch(searchUrl.toString())
      if (res.status === 401) throw new Error('FACEBOOK_TOKEN_MISSING: token invalido ou expirado')
      if (!res.ok) throw new Error(`Facebook Graph API HTTP ${res.status}`)
      return res.json() as Promise<{ data?: Array<Record<string, unknown>> }>
    })

    const pages = searchRaw.data ?? []
    if (pages.length === 0) return []

    // Take first page and fetch detailed data with posts
    const pageId = pages[0].id as string
    const detailUrl = new URL(`${FB_API_BASE}/${pageId}`)
    detailUrl.searchParams.set(
      'fields',
      'fan_count,posts{created_time,likes.summary(true)},website,about,username'
    )
    detailUrl.searchParams.set('access_token', apiKey)

    const detail = await withRetry(async () => {
      const res = await fetch(detailUrl.toString())
      if (!res.ok) throw new Error(`Facebook page detail HTTP ${res.status}`)
      return res.json() as Promise<Record<string, unknown>>
    })

    const fanCount = (detail.fan_count as number) ?? 0
    const postsData = (detail.posts as { data?: FbPost[] } | undefined)?.data ?? []
    const { engagementRate, lastPostAt, abandonedSignal } = analyzeEngagement({
      fan_count: fanCount,
      posts: postsData.slice(0, 10),
    })

    return [{
      handle: (detail.username as string | null) ?? (pages[0].name as string),
      followers: fanCount,
      bio: (detail.about as string | null) ?? null,
      externalLink: (detail.website as string | null) ?? null,
      lastPostAt,
      postsLast30d: postsData.filter(p => {
        if (!p.created_time) return false
        return daysSince(new Date(p.created_time)) <= 30
      }).length,
      engagementRate,
      abandonedSignal,
      source: 'facebook-graph',
      rawJson: detail,
    }]
  },
}
