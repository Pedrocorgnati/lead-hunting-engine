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
