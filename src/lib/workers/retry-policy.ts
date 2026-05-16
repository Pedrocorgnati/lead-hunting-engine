const BASE_MS = 60_000
const MAX_MS = 3_600_000

/**
 * Exponential backoff with full-random jitter (cap 30%).
 * Prevents thundering herd on mass-retry scenarios.
 */
export function computeRetryDelay(
  attempt: number,
  opts?: { jitterFactor?: number },
): number {
  const base = Math.min(BASE_MS * Math.pow(2, attempt), MAX_MS)
  const jitter = 1 + Math.random() * (opts?.jitterFactor ?? 0.3)
  return Math.floor(base * jitter)
}
