import {
  evaluateFacebookAbandonment,
  FACEBOOK_ABANDONED_DAYS_DEFAULT,
} from '../facebook-abandonment'

const NOW = new Date('2026-04-21T00:00:00Z')

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000)
}

describe('evaluateFacebookAbandonment', () => {
  it('post recente (<30d) nao abandona', () => {
    const r = evaluateFacebookAbandonment(
      { lastPostAt: daysAgo(10), followers: 500, engagementRate: 0.02 },
      { now: NOW }
    )
    expect(r.abandoned).toBe(false)
    expect(r.daysSinceLastPost).toBe(10)
    expect(r.reasons).toEqual([])
  })

  it('post no limite (30-89d) ainda nao abandona por data', () => {
    const r = evaluateFacebookAbandonment(
      { lastPostAt: daysAgo(60), followers: 1000, engagementRate: 0.01 },
      { now: NOW }
    )
    expect(r.abandoned).toBe(false)
    expect(r.reasons).toEqual([])
  })

  it('post >=90 dias marca stale_last_post', () => {
    const r = evaluateFacebookAbandonment(
      { lastPostAt: daysAgo(FACEBOOK_ABANDONED_DAYS_DEFAULT + 5), followers: 200 },
      { now: NOW }
    )
    expect(r.abandoned).toBe(true)
    expect(r.reasons).toContain('stale_last_post')
  })

  it('zero posts (lastPostAt null) marca no_posts', () => {
    const r = evaluateFacebookAbandonment(
      { lastPostAt: null, followers: 100 },
      { now: NOW }
    )
    expect(r.abandoned).toBe(true)
    expect(r.reasons).toContain('no_posts')
  })

  it('engagementRate=0 com followers marca zero_engagement', () => {
    const r = evaluateFacebookAbandonment(
      { lastPostAt: daysAgo(5), followers: 5000, engagementRate: 0 },
      { now: NOW }
    )
    expect(r.abandoned).toBe(true)
    expect(r.reasons).toContain('zero_engagement')
  })

  it('engagementRate baixa (<0.001) marca low_engagement', () => {
    const r = evaluateFacebookAbandonment(
      { lastPostAt: daysAgo(5), followers: 10_000, engagementRate: 0.0005 },
      { now: NOW }
    )
    expect(r.abandoned).toBe(true)
    expect(r.reasons).toContain('low_engagement')
  })

  it('threshold configuravel via config.abandonedDays', () => {
    const r = evaluateFacebookAbandonment(
      { lastPostAt: daysAgo(45), followers: 200 },
      { now: NOW, abandonedDays: 30 }
    )
    expect(r.abandoned).toBe(true)
    expect(r.reasons).toContain('stale_last_post')
  })

  it('aceita lastPostAt como string ISO', () => {
    const r = evaluateFacebookAbandonment(
      { lastPostAt: daysAgo(120).toISOString(), followers: 100 },
      { now: NOW }
    )
    expect(r.abandoned).toBe(true)
    expect(r.daysSinceLastPost).toBeGreaterThanOrEqual(FACEBOOK_ABANDONED_DAYS_DEFAULT)
  })
})
