/**
 * Rate limiting via TokenBucket.
 *
 * Cada provider externo tem um bucket independente com capacidade igual a
 * `requestsPerSecond` (permite burst inicial) e taxa de refill igual a
 * `requestsPerSecond` tokens/s. Quando o bucket fica vazio, `take()` aguarda
 * o tempo necessario para acumular 1 token e prossegue.
 *
 * API publica preservada: `RateLimiter.wait(provider)` continua sendo o ponto
 * de entrada. Implementacao interna trocada de spaced-window para token bucket
 * para honrar a promessa de M9 ("rate limiting token bucket") e permitir burst
 * controlado quando o provider acabou de ficar ocioso.
 */

interface RateLimitConfig {
  requestsPerSecond: number
}

const PROVIDER_LIMITS: Record<string, RateLimitConfig> = {
  'google-places': { requestsPerSecond: 10 },
  'outscraper':    { requestsPerSecond: 3 },
  'apify':         { requestsPerSecond: 5 },
  'here-maps':     { requestsPerSecond: 5 },
  'tomtom':        { requestsPerSecond: 5 },
  'nominatim':     { requestsPerSecond: 1 },
  'overture-maps': { requestsPerSecond: 2 },
}

const DEFAULT_LIMIT: RateLimitConfig = { requestsPerSecond: 2 }

export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private readonly capacity: number,
    private readonly refillRatePerSec: number,
    now: number = Date.now(),
  ) {
    this.tokens = capacity
    this.lastRefill = now
  }

  /**
   * Refilla o bucket com base no tempo decorrido. Tokens nunca passam da
   * capacidade.
   */
  private refill(now: number): void {
    const elapsedSec = (now - this.lastRefill) / 1000
    if (elapsedSec <= 0) return
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRatePerSec)
    this.lastRefill = now
  }

  /**
   * Consome 1 token, esperando se necessario. Resolve quando o token foi
   * efetivamente debitado.
   */
  async take(): Promise<void> {
    // Loop e necessario porque, em ambientes com timers imprecisos, o sleep
    // pode acordar com o token ainda nao totalmente acumulado.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.refill(Date.now())
      if (this.tokens >= 1) {
        this.tokens -= 1
        return
      }
      const tokensNeeded = 1 - this.tokens
      const waitMs = Math.ceil((tokensNeeded / this.refillRatePerSec) * 1000)
      await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 1)))
    }
  }

  /** Estado interno — exposto para teste/observabilidade. */
  snapshot(): { tokens: number; capacity: number; refillRatePerSec: number } {
    return { tokens: this.tokens, capacity: this.capacity, refillRatePerSec: this.refillRatePerSec }
  }
}

const buckets: Record<string, TokenBucket> = {}

function getBucket(provider: string): TokenBucket {
  if (!buckets[provider]) {
    const config = PROVIDER_LIMITS[provider] ?? DEFAULT_LIMIT
    // capacity == rps -> permite burst de ate rps chamadas instantaneas apos
    // periodo ocioso, depois throttling em rps tokens/s.
    buckets[provider] = new TokenBucket(config.requestsPerSecond, config.requestsPerSecond)
  }
  return buckets[provider]
}

export class RateLimiter {
  static async wait(provider: string): Promise<void> {
    await getBucket(provider).take()
  }

  /**
   * Reset interno — util apenas para testes que precisam isolar estado entre
   * cenarios. Producao nao deve depender disso.
   */
  static __resetForTests(): void {
    for (const key of Object.keys(buckets)) {
      delete buckets[key]
    }
  }
}
