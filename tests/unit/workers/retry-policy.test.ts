import { computeRetryDelay } from '@/lib/workers/retry-policy'

const BASE_MS = 60_000

describe('computeRetryDelay', () => {
  it('applies jitter between 1.0x and 1.3x of base', () => {
    const samples = Array.from({ length: 1000 }, () => computeRetryDelay(3))
    const base = BASE_MS * Math.pow(2, 3)
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(base)
    expect(Math.max(...samples)).toBeLessThanOrEqual(Math.ceil(base * 1.3))
  })

  it('caps at MAX_MS with jitter', () => {
    const samples = Array.from({ length: 100 }, () => computeRetryDelay(20))
    expect(Math.max(...samples)).toBeLessThanOrEqual(3_600_000 * 1.3)
  })

  it('accepts custom jitter factor', () => {
    const samples = Array.from({ length: 100 }, () => computeRetryDelay(0, { jitterFactor: 0.1 }))
    expect(Math.max(...samples)).toBeLessThanOrEqual(Math.ceil(BASE_MS * 1.1))
  })
})
