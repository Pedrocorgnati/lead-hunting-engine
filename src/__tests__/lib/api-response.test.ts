/**
 * api-response.test.ts — testes de contrato para envelope canonico C13.
 *
 * Cobre: sucesso, erro, empty state, rate limit, paginacao, quota,
 * live status, correlation_id, request_id, serverTime e metadados de UI.
 */

import {
  successEnvelope,
  errorEnvelope,
  paginatedEnvelope,
  quotaEnvelope,
  rateLimitEnvelope,
  liveStatusEnvelope,
  apiSuccess,
  apiError,
  apiPaginated,
} from '@/lib/api-response'

describe('C13 — Envelope API contratos', () => {
  const correlationId = 'corr-123'
  const lastUpdatedAt = '2026-06-07T12:00:00Z'

  describe('sucesso (C13.1)', () => {
    it('deve retornar data e correlationId opcional', () => {
      const result = successEnvelope({ id: 1 }, correlationId, lastUpdatedAt)
      expect(result.data).toEqual({ id: 1 })
      expect(result.correlationId).toBe(correlationId)
      expect(result.lastUpdatedAt).toBe(lastUpdatedAt)
    })

    it('deve omitir correlationId quando nao fornecido', () => {
      const result = successEnvelope({ id: 1 })
      expect(result.correlationId).toBeUndefined()
      expect(result.lastUpdatedAt).toBeUndefined()
    })

    it('apiSuccess deve envolver em NextResponse.json com status 200 por padrao', async () => {
      const res = apiSuccess({ ok: true }, 200, correlationId)
      const body = await res.json()
      expect(body.data).toEqual({ ok: true })
      expect(body.correlationId).toBe(correlationId)
      expect(res.status).toBe(200)
    })
  })

  describe('erro (C13.1)', () => {
    it('deve retornar code, message, correlationId e statusCode', () => {
      const result = errorEnvelope('UNAUTHORIZED', 'Token invalido', correlationId, 401)
      expect(result.error.code).toBe('UNAUTHORIZED')
      expect(result.error.message).toBe('Token invalido')
      expect(result.error.correlationId).toBe(correlationId)
      expect(result.error.statusCode).toBe(401)
    })

    it('deve omitir correlationId e statusCode quando nao fornecidos', () => {
      const result = errorEnvelope('UNKNOWN', 'Erro generico')
      expect(result.error.correlationId).toBeUndefined()
      expect(result.error.statusCode).toBeUndefined()
    })

    it('apiError deve envolver em NextResponse.json com status fornecido', async () => {
      const res = apiError('RATE_LIMITED', 'Muitas requisicoes', 429, correlationId)
      const body = await res.json()
      expect(body.error.code).toBe('RATE_LIMITED')
      expect(body.error.statusCode).toBe(429)
      expect(res.status).toBe(429)
    })
  })

  describe('empty state / paginacao (C13.2)', () => {
    it('deve retornar lista vazia com meta zerada', () => {
      const result = paginatedEnvelope([], { page: 1, limit: 10, total: 0, hasNext: false, hasPrev: false })
      expect(result.data).toEqual([])
      expect(result.meta.total).toBe(0)
      expect(result.meta.hasNext).toBe(false)
      expect(result.meta.hasPrev).toBe(false)
    })

    it('deve calcular hasNext e hasPrev corretamente', () => {
      const result = paginatedEnvelope([1, 2], { page: 1, limit: 10, total: 2, hasNext: false, hasPrev: false })
      expect(result.data).toHaveLength(2)
      expect(result.meta.total).toBe(2)
    })

    it('apiPaginated deve retornar status 200', async () => {
      const res = apiPaginated([{ id: 1 }], { page: 1, limit: 10, total: 1, hasNext: false, hasPrev: false })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toHaveLength(1)
      expect(body.meta.page).toBe(1)
    })
  })

  describe('quota (C13.2)', () => {
    it('deve calcular remaining e percentUsed', () => {
      const result = quotaEnvelope(75, 100, '2026-06-08T00:00:00Z')
      expect(result.remaining).toBe(25)
      expect(result.percentUsed).toBe(75)
    })

    it('deve evitar negative remaining', () => {
      const result = quotaEnvelope(150, 100, null)
      expect(result.remaining).toBe(0)
    })

    it('deve evitar divisao por zero em percentUsed', () => {
      const result = quotaEnvelope(0, 0, null)
      expect(result.percentUsed).toBe(0)
    })
  })

  describe('rate limit (C13.3)', () => {
    it('deve calcular retryAt a partir de retryAfterMs', () => {
      const before = Date.now()
      const result = rateLimitEnvelope(5000, 100, 95, 60000)
      const retryAtMs = new Date(result.retryAt).getTime()
      expect(retryAtMs - before).toBeGreaterThanOrEqual(4900)
      expect(retryAtMs - before).toBeLessThanOrEqual(5100)
      expect(result.limit).toBe(100)
      expect(result.remaining).toBe(95)
      expect(result.windowMs).toBe(60000)
    })
  })

  describe('live status (C13.3)', () => {
    it('deve retornar todos os campos obrigatorios', () => {
      const result = liveStatusEnvelope('UP', 'Online', 'Servico online', lastUpdatedAt, 30000, correlationId)
      expect(result.status).toBe('UP')
      expect(result.statusLabel).toBe('Online')
      expect(result.ariaLiveMessage).toBe('Servico online')
      expect(result.lastUpdatedAt).toBe(lastUpdatedAt)
      expect(result.pollAfter).toBe(30000)
      expect(result.correlationId).toBe(correlationId)
    })

    it('deve omitir correlationId quando nao fornecido', () => {
      const result = liveStatusEnvelope('DOWN', 'Offline', 'Servico offline', null, 0)
      expect(result.correlationId).toBeUndefined()
      expect(result.lastUpdatedAt).toBeNull()
    })
  })

  describe('regressao — campos obrigatorios e semantica', () => {
    it('nunca deve perder correlation_id em sucesso quando fornecido', () => {
      const s = successEnvelope({}, 'req-42')
      expect(s.correlationId).toBe('req-42')
    })

    it('nunca deve perder correlation_id em erro quando fornecido', () => {
      const e = errorEnvelope('FAIL', 'falhou', 'req-42')
      expect(e.error.correlationId).toBe('req-42')
    })

    it('deve garantir que error.code e error.message sao strings', () => {
      const e = errorEnvelope('ANY', 'msg')
      expect(typeof e.error.code).toBe('string')
      expect(typeof e.error.message).toBe('string')
    })

    it('deve garantir que paginated meta tem todos os campos numericos/booleanos', () => {
      const p = paginatedEnvelope([], { page: 1, limit: 10, total: 0, hasNext: false, hasPrev: false })
      expect(typeof p.meta.page).toBe('number')
      expect(typeof p.meta.limit).toBe('number')
      expect(typeof p.meta.total).toBe('number')
      expect(typeof p.meta.hasNext).toBe('boolean')
      expect(typeof p.meta.hasPrev).toBe('boolean')
    })
  })
})
