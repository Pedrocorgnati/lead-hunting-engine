import { withRetry } from '../retry-backoff'

describe('withRetry', () => {
  it('retorna resultado na primeira tentativa se sucesso', async () => {
    const result = await withRetry(async () => 'ok')
    expect(result).toBe('ok')
  })

  it('retenta em erro 429 e retorna na segunda tentativa', async () => {
    let attempt = 0
    const result = await withRetry(
      async () => {
        attempt++
        if (attempt === 1) throw new Error('429 rate limit')
        return 'ok'
      },
      { baseDelayMs: 10 }
    )
    expect(result).toBe('ok')
    expect(attempt).toBe(2)
  })

  it('retenta em erro 503', async () => {
    let attempt = 0
    const result = await withRetry(
      async () => {
        attempt++
        if (attempt <= 2) throw new Error('503 service unavailable')
        return 'ok'
      },
      { baseDelayMs: 10 }
    )
    expect(result).toBe('ok')
    expect(attempt).toBe(3)
  })

  it('lança erro após maxRetries esgotados', async () => {
    await expect(
      withRetry(
        async () => { throw new Error('503 service unavailable') },
        { maxRetries: 2, baseDelayMs: 10 }
      )
    ).rejects.toThrow('503')
  })

  it('não retenta em erros não recuperáveis', async () => {
    let attempt = 0
    await expect(
      withRetry(
        async () => {
          attempt++
          throw new Error('invalid input')
        },
        { baseDelayMs: 10 }
      )
    ).rejects.toThrow('invalid input')
    expect(attempt).toBe(1)
  })

  it('retenta em timeout', async () => {
    let attempt = 0
    const result = await withRetry(
      async () => {
        attempt++
        if (attempt === 1) throw new Error('timeout exceeded')
        return 'ok'
      },
      { baseDelayMs: 10 }
    )
    expect(result).toBe('ok')
    expect(attempt).toBe(2)
  })
})
