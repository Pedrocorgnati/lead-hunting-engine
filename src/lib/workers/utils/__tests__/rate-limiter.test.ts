import { RateLimiter } from '../rate-limiter'

describe('RateLimiter', () => {
  it('respeita intervalo mínimo entre chamadas', async () => {
    // outscraper: 3 req/s = ~333ms intervalo
    const start = Date.now()
    await RateLimiter.wait('outscraper')
    await RateLimiter.wait('outscraper')
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(300)
  })

  it('usa default para providers desconhecidos', async () => {
    await expect(RateLimiter.wait('unknown-provider')).resolves.toBeUndefined()
  })

  it('permite chamadas imediatas para providers diferentes', async () => {
    const start = Date.now()
    await RateLimiter.wait('google-places')
    await RateLimiter.wait('here-maps')
    const elapsed = Date.now() - start

    // Diferentes providers não devem bloquear um ao outro
    expect(elapsed).toBeLessThan(200)
  })
})
