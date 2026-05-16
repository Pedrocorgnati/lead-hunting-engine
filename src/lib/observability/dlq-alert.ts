import * as Sentry from '@sentry/nextjs'

interface ProviderCounter {
  count: number
  resetAt: number
}

const THRESHOLD = 10
const WINDOW_MS = 60 * 60 * 1000

const counters = new Map<string, ProviderCounter>()

/** Increment DLQ failure counter for provider. Fires Sentry alert at threshold. */
export function recordDlqFailure(provider: string): void {
  const now = Date.now()
  const existing = counters.get(provider)

  if (!existing || now >= existing.resetAt) {
    counters.set(provider, { count: 1, resetAt: now + WINDOW_MS })
    return
  }

  existing.count += 1

  if (existing.count >= THRESHOLD) {
    Sentry.captureMessage('DLQ batch threshold reached', {
      level: 'warning',
      tags: { provider },
      extra: { count: existing.count, windowMs: WINDOW_MS },
    })
    // reset after firing
    counters.set(provider, { count: 0, resetAt: now + WINDOW_MS })
  }
}

/** Exposed for testing */
export function _resetCounters(): void {
  counters.clear()
}
