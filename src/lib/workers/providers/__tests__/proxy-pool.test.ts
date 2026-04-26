/**
 * Smoke tests para ProxyPool (TASK-12 intake-review / ST002).
 * Verifica quarentena apos FAIL_THRESHOLD falhas consecutivas.
 */
import { ProxyPool } from '../proxy-pool'

describe('ProxyPool', () => {
  it('quarantines a proxy after 5 consecutive failures', () => {
    const pool = new ProxyPool([
      { host: 'bad.example', port: 8080 },
      { host: 'good.example', port: 8080 },
    ])
    const bad = pool.next()!
    expect(pool.healthy().length).toBe(2)
    for (let i = 0; i < 5; i++) pool.reportFailure(bad, 'test')
    expect(pool.healthy().length).toBe(1)
    expect(pool.status().quarantined).toHaveLength(1)
  })

  it('round-robin cursor rotates between healthy proxies', () => {
    const pool = new ProxyPool([
      { host: 'a.example', port: 80 },
      { host: 'b.example', port: 80 },
    ])
    const first = pool.next()
    const second = pool.next()
    expect(first?.host).not.toBe(second?.host)
  })

  it('returns null when pool is empty (fallback direct)', () => {
    const pool = new ProxyPool([])
    expect(pool.next()).toBeNull()
  })
})
