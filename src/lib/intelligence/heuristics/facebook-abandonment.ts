export const FACEBOOK_ABANDONED_DAYS_DEFAULT = 90
export const FACEBOOK_LOW_ENGAGEMENT_THRESHOLD_DEFAULT = 0.001

export interface FacebookAbandonmentInput {
  lastPostAt: Date | string | null | undefined
  followers?: number | null
  engagementRate?: number | null
  postsLast30d?: number | null
}

export interface FacebookAbandonmentConfig {
  abandonedDays?: number
  lowEngagementThreshold?: number
  now?: Date
}

export type AbandonmentReason =
  | 'no_posts'
  | 'stale_last_post'
  | 'zero_engagement'
  | 'low_engagement'

export interface FacebookAbandonmentResult {
  abandoned: boolean
  daysSinceLastPost: number | null
  reasons: AbandonmentReason[]
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000)
}

export function evaluateFacebookAbandonment(
  input: FacebookAbandonmentInput,
  config: FacebookAbandonmentConfig = {}
): FacebookAbandonmentResult {
  const abandonedDays = config.abandonedDays ?? FACEBOOK_ABANDONED_DAYS_DEFAULT
  const lowEngagement =
    config.lowEngagementThreshold ?? FACEBOOK_LOW_ENGAGEMENT_THRESHOLD_DEFAULT
  const now = config.now ?? new Date()

  const reasons: AbandonmentReason[] = []
  const lastPost = input.lastPostAt ? new Date(input.lastPostAt) : null
  const valid = lastPost && !Number.isNaN(lastPost.getTime()) ? lastPost : null

  const daysSinceLastPost = valid ? daysBetween(now, valid) : null

  if (!valid || (input.postsLast30d ?? 0) === 0 && daysSinceLastPost === null) {
    reasons.push('no_posts')
  } else if (daysSinceLastPost !== null && daysSinceLastPost >= abandonedDays) {
    reasons.push('stale_last_post')
  }

  if ((input.followers ?? 0) > 0) {
    const rate = input.engagementRate
    if (rate === 0) {
      reasons.push('zero_engagement')
    } else if (rate != null && rate > 0 && rate < lowEngagement) {
      reasons.push('low_engagement')
    }
  }

  return {
    abandoned: reasons.length > 0,
    daysSinceLastPost,
    reasons,
  }
}
