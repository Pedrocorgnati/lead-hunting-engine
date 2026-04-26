const MAX_ADAPTIVE_DELAY_MS = 5 * 60 * 1000 // 5min
const ADAPTIVE_BASE_MS = 1000

// ─── Adaptive Backoff (CL-172) ─────────────────────────────────────────────

export class AdaptiveBackoff {
  private state = new Map<string, number>()

  private key(jobId: string, source: string): string {
    return `${jobId}:${source}`
  }

  fail(jobId: string, source: string): void {
    const k = this.key(jobId, source)
    this.state.set(k, (this.state.get(k) ?? 0) + 1)
  }

  success(jobId: string, source: string): void {
    const k = this.key(jobId, source)
    const current = this.state.get(k) ?? 0
    if (current > 0) this.state.set(k, current - 1)
  }

  nextDelay(jobId: string, source: string): number {
    const failures = this.state.get(this.key(jobId, source)) ?? 0
    if (failures === 0) return 0
    const delay = ADAPTIVE_BASE_MS * Math.pow(2, failures - 1)
    const jitter = Math.random() * delay * 0.2
    return Math.min(delay + jitter, MAX_ADAPTIVE_DELAY_MS)
  }

  consecutiveFailures(jobId: string, source: string): number {
    return this.state.get(this.key(jobId, source)) ?? 0
  }

  reset(jobId: string, source: string): void {
    this.state.delete(this.key(jobId, source))
  }
}

// Global singleton
export const adaptiveBackoff = new AdaptiveBackoff()

// ─── Static Retry ────────────────────────────────────────────────────────────

interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  retryOn?: (error: unknown) => boolean
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    retryOn = (e) => {
      if (e instanceof Error) {
        return (
          e.message.includes('429') ||
          e.message.includes('503') ||
          e.message.includes('ECONNRESET') ||
          e.message.includes('timeout') ||
          e.message.includes('abort')
        )
      }
      return false
    },
  } = options

  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === maxRetries || !retryOn(error)) throw error

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      const jitter = Math.random() * delay * 0.1
      await new Promise(resolve => setTimeout(resolve, delay + jitter))
    }
  }
  throw lastError
}
