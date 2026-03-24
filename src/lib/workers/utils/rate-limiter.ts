interface RateLimitConfig {
  requestsPerSecond: number
}

const PROVIDER_LIMITS: Record<string, RateLimitConfig> = {
  'google-places': { requestsPerSecond: 10 },
  'outscraper':    { requestsPerSecond: 3 },
  'apify':         { requestsPerSecond: 5 },
  'here-maps':     { requestsPerSecond: 5 },
  'tomtom':        { requestsPerSecond: 5 },
}

const lastRequestTime: Record<string, number> = {}

export class RateLimiter {
  static async wait(provider: string): Promise<void> {
    const config = PROVIDER_LIMITS[provider] ?? { requestsPerSecond: 2 }
    const minInterval = 1000 / config.requestsPerSecond

    const last = lastRequestTime[provider] ?? 0
    const elapsed = Date.now() - last
    const waitMs = Math.max(0, minInterval - elapsed)

    if (waitMs > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }

    lastRequestTime[provider] = Date.now()
  }
}
