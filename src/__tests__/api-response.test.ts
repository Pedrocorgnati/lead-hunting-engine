import { successEnvelope, errorEnvelope, paginatedEnvelope, quotaEnvelope, rateLimitEnvelope, liveStatusEnvelope } from '@/lib/api-response'

describe('api-response envelope contract', () => {
  describe('successEnvelope', () => {
    it('inclui data no envelope', () => {
      const env = successEnvelope({ id: '1', name: 'Test' })
      expect(env.data).toEqual({ id: '1', name: 'Test' })
    })
    it('inclui correlationId quando fornecido', () => {
      const env = successEnvelope({}, 'corr-1')
      expect(env.correlationId).toBe('corr-1')
    })
    it('nao inclui correlationId quando ausente', () => {
      const env = successEnvelope({})
      expect(env).not.toHaveProperty('correlationId')
    })
  })

  describe('errorEnvelope', () => {
    it('retorna objeto error com code e message', () => {
      const env = errorEnvelope('ERR_001', 'Algo deu errado.')
      expect(env.error.code).toBe('ERR_001')
      expect(env.error.message).toBe('Algo deu errado.')
    })
    it('inclui correlationId e statusCode quando fornecidos', () => {
      const env = errorEnvelope('ERR_002', 'Not found.', 'corr-2', 404)
      expect(env.error.correlationId).toBe('corr-2')
      expect(env.error.statusCode).toBe(404)
    })
    it('nao vaza campos sensiveis fora do campo error', () => {
      const env = errorEnvelope('ERR_003', 'Internal.')
      expect(env).not.toHaveProperty('data')
      expect(env).not.toHaveProperty('stack')
    })
  })

  describe('paginatedEnvelope', () => {
    const meta = { page: 1, limit: 10, total: 25, hasNext: true, hasPrev: false }
    it('inclui meta com campos obrigatorios', () => {
      const env = paginatedEnvelope([1, 2, 3], meta)
      expect(env.meta.total).toBe(25)
      expect(env.meta.hasNext).toBe(true)
      expect(env.meta.hasPrev).toBe(false)
    })
    it('data e array', () => {
      const env = paginatedEnvelope([{ id: 'a' }], meta)
      expect(Array.isArray(env.data)).toBe(true)
    })
  })

  describe('quotaEnvelope', () => {
    it('calcula remaining e percentUsed corretamente', () => {
      const env = quotaEnvelope(30, 100, null)
      expect(env.remaining).toBe(70)
      expect(env.percentUsed).toBe(30)
    })
    it('nao retorna negativo em remaining', () => {
      const env = quotaEnvelope(150, 100, null)
      expect(env.remaining).toBe(0)
    })
  })

  describe('rateLimitEnvelope', () => {
    it('inclui retryAt como ISO string', () => {
      const env = rateLimitEnvelope(60_000, 100, 0, 60_000)
      expect(typeof env.retryAt).toBe('string')
      expect(new Date(env.retryAt).getTime()).toBeGreaterThan(Date.now() - 100)
    })
  })

  describe('liveStatusEnvelope', () => {
    it('inclui todos os campos de contrato live', () => {
      const env = liveStatusEnvelope('RUNNING', 'Em execucao', 'Job em execucao', '2026-01-01T00:00:00Z', 5000, 'corr-live')
      expect(env.status).toBe('RUNNING')
      expect(env.statusLabel).toBe('Em execucao')
      expect(env.ariaLiveMessage).toBeTruthy()
      expect(env.pollAfter).toBe(5000)
      expect(env.correlationId).toBe('corr-live')
    })
  })
})
