import { RateLimiter, TokenBucket } from '../rate-limiter'

describe('RateLimiter (TokenBucket)', () => {
  beforeEach(() => {
    RateLimiter.__resetForTests()
  })

  it('permite burst inicial ate a capacidade do bucket sem aguardar', async () => {
    // outscraper: 3 req/s -> capacidade 3 -> 3 chamadas instantaneas
    const start = Date.now()
    await RateLimiter.wait('outscraper')
    await RateLimiter.wait('outscraper')
    await RateLimiter.wait('outscraper')
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(100)
  })

  it('throttle apos esgotar tokens — espera tempo de refill antes de prosseguir', async () => {
    // outscraper: 3 req/s -> 4a chamada precisa aguardar ~333ms para refill de 1 token
    const start = Date.now()
    await RateLimiter.wait('outscraper')
    await RateLimiter.wait('outscraper')
    await RateLimiter.wait('outscraper')
    await RateLimiter.wait('outscraper')
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(300)
  })

  it('usa default para providers desconhecidos', async () => {
    await expect(RateLimiter.wait('unknown-provider')).resolves.toBeUndefined()
  })

  it('permite chamadas imediatas para providers diferentes (buckets independentes)', async () => {
    const start = Date.now()
    await RateLimiter.wait('google-places')
    await RateLimiter.wait('here-maps')
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(200)
  })
})

describe('TokenBucket — semantica isolada', () => {
  it('snapshot inicial reflete capacity cheia', () => {
    const bucket = new TokenBucket(5, 5)
    expect(bucket.snapshot()).toEqual({ tokens: 5, capacity: 5, refillRatePerSec: 5 })
  })

  it('take consome 1 token quando ha tokens disponiveis', async () => {
    const bucket = new TokenBucket(2, 2)
    await bucket.take()
    expect(bucket.snapshot().tokens).toBeCloseTo(1, 5)
  })

  it('refill reabastece tokens ate a capacidade ao longo do tempo', async () => {
    const bucket = new TokenBucket(2, 10) // 10 tokens/s
    await bucket.take()
    await bucket.take()
    // Bucket vazio agora; aguardar 200ms deve recuperar ~2 tokens
    await new Promise((r) => setTimeout(r, 250))
    await bucket.take()
    // Sem aguardar — ja tem token
    const before = Date.now()
    await bucket.take()
    expect(Date.now() - before).toBeLessThan(50)
  })

  it('nunca acumula acima da capacity', async () => {
    const bucket = new TokenBucket(3, 100)
    await new Promise((r) => setTimeout(r, 100)) // ample time to overflow theoretically
    await bucket.take()
    expect(bucket.snapshot().tokens).toBeLessThanOrEqual(3)
  })
})
