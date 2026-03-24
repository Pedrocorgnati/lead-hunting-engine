/**
 * Simple in-memory rate limiter using Map.
 * Not persistent across deploys — suitable for MVP.
 */
const requests = new Map<string, number[]>()

export function checkRateLimit(
  key: string,
  maxRequests: number = 3,
  windowMs: number = 60_000
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  const timestamps = requests.get(key) ?? []

  // Clean expired entries
  const valid = timestamps.filter(t => now - t < windowMs)

  if (valid.length >= maxRequests) {
    const oldestValid = valid[0]
    return { allowed: false, retryAfterMs: windowMs - (now - oldestValid) }
  }

  valid.push(now)
  requests.set(key, valid)

  // Periodic cleanup (every 100 checks)
  if (requests.size > 100) {
    for (const [k, v] of requests) {
      const filtered = v.filter(t => now - t < windowMs)
      if (filtered.length === 0) requests.delete(k)
      else requests.set(k, filtered)
    }
  }

  return { allowed: true, retryAfterMs: 0 }
}
