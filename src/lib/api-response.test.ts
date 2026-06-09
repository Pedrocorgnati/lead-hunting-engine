/**
 * api-response.test.ts — testes de contrato para os envelopes C13.1–C13.3.
 * Falham se o envelope perder campos obrigatórios ou quebrar semântica de erro acessível.
 */

import {
  successEnvelope,
  errorEnvelope,
  paginatedEnvelope,
  quotaEnvelope,
  rateLimitEnvelope,
  liveStatusEnvelope,
  type ApiSuccess,
  type ApiError,
  type PaginatedSuccess,
  type QuotaEnvelope,
  type RateLimitEnvelope,
  type LiveStatusEnvelope,
} from './api-response'

// ---------------------------------------------------------------------------
// C13.1 — Sucesso / Erro
// ---------------------------------------------------------------------------

describe('successEnvelope (C13.1)', () => {
  it('contém campo data obrigatório', () => {
    const env = successEnvelope({ id: 1 })
    expect(env).toHaveProperty('data')
    expect(env.data).toEqual({ id: 1 })
  })

  it('correlationId opcional aparece somente quando fornecido', () => {
    const withCorr = successEnvelope({}, 'corr-123')
    expect(withCorr.correlationId).toBe('corr-123')

    const without = successEnvelope({})
    expect(without).not.toHaveProperty('correlationId')
  })

  it('lastUpdatedAt opcional aparece somente quando fornecido', () => {
    const iso = '2026-01-01T00:00:00Z'
    const env = successEnvelope({}, undefined, iso)
    expect(env.lastUpdatedAt).toBe(iso)

    const without = successEnvelope({})
    expect(without).not.toHaveProperty('lastUpdatedAt')
  })

  it('tipagem: ApiSuccess<T> satisfaz o contrato de campos', () => {
    const env: ApiSuccess<string> = successEnvelope('ok')
    expect(typeof env.data).toBe('string')
  })
})

describe('errorEnvelope (C13.1)', () => {
  it('contém campo error.code e error.message obrigatórios', () => {
    const env = errorEnvelope('VALIDATION_ERROR', 'Campo obrigatório ausente.')
    expect(env.error.code).toBe('VALIDATION_ERROR')
    expect(env.error.message).toBe('Campo obrigatório ausente.')
  })

  it('error.message é string não-vazia (semântica de erro acessível)', () => {
    const env = errorEnvelope('E001', 'Descreve o problema')
    expect(typeof env.error.message).toBe('string')
    expect(env.error.message.length).toBeGreaterThan(0)
  })

  it('correlationId opcional no erro', () => {
    const withCorr = errorEnvelope('E001', 'msg', 'corr-abc')
    expect(withCorr.error.correlationId).toBe('corr-abc')

    const without = errorEnvelope('E001', 'msg')
    expect(without.error).not.toHaveProperty('correlationId')
  })

  it('statusCode opcional aparece somente quando fornecido', () => {
    const with400 = errorEnvelope('E001', 'msg', undefined, 400)
    expect(with400.error.statusCode).toBe(400)

    const without = errorEnvelope('E001', 'msg')
    expect(without.error).not.toHaveProperty('statusCode')
  })

  it('tipagem: ApiError satisfaz contrato de campos', () => {
    const env: ApiError = errorEnvelope('X', 'y')
    expect(env.error).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// C13.2 — Listas / Quotas
// ---------------------------------------------------------------------------

describe('paginatedEnvelope (C13.2)', () => {
  const meta = { page: 1, limit: 20, total: 55, hasNext: true, hasPrev: false }

  it('contém data (array) e meta obrigatórios', () => {
    const env = paginatedEnvelope([1, 2, 3], meta)
    expect(Array.isArray(env.data)).toBe(true)
    expect(env.meta).toEqual(meta)
  })

  it('meta.hasNext é false quando page * limit >= total', () => {
    const lastMeta = { page: 3, limit: 20, total: 55, hasNext: false, hasPrev: true }
    const env: PaginatedSuccess<number> = paginatedEnvelope([], lastMeta)
    expect(env.meta.hasNext).toBe(false)
    expect(env.meta.hasPrev).toBe(true)
  })

  it('correlationId propagado para PaginatedSuccess', () => {
    const env = paginatedEnvelope([], meta, 'corr-xyz')
    expect(env.correlationId).toBe('corr-xyz')
  })
})

describe('quotaEnvelope (C13.2)', () => {
  it('calcula remaining e percentUsed corretamente', () => {
    const env: QuotaEnvelope = quotaEnvelope(30, 100, null)
    expect(env.remaining).toBe(70)
    expect(env.percentUsed).toBe(30)
  })

  it('remaining nunca é negativo quando usado > limite', () => {
    const env = quotaEnvelope(120, 100, null)
    expect(env.remaining).toBe(0)
  })

  it('percentUsed é 0 quando limite é 0 (evita divisão por zero)', () => {
    const env = quotaEnvelope(0, 0, null)
    expect(env.percentUsed).toBe(0)
  })

  it('resetAt nulo é preservado', () => {
    const env = quotaEnvelope(10, 100, null)
    expect(env.resetAt).toBeNull()
  })

  it('resetAt ISO preservado quando fornecido', () => {
    const iso = '2026-06-01T00:00:00Z'
    const env = quotaEnvelope(10, 100, iso)
    expect(env.resetAt).toBe(iso)
  })
})

// ---------------------------------------------------------------------------
// C13.3 — Jobs / Rate-limit
// ---------------------------------------------------------------------------

describe('rateLimitEnvelope (C13.3)', () => {
  it('contém todos os campos obrigatórios', () => {
    const env: RateLimitEnvelope = rateLimitEnvelope(5000, 100, 3, 60000)
    expect(env).toHaveProperty('retryAfterMs', 5000)
    expect(env).toHaveProperty('retryAt')
    expect(env).toHaveProperty('limit', 100)
    expect(env).toHaveProperty('remaining', 3)
    expect(env).toHaveProperty('windowMs', 60000)
  })

  it('retryAt é ISO-8601 válido', () => {
    const env = rateLimitEnvelope(1000, 10, 0, 60000)
    expect(() => new Date(env.retryAt).toISOString()).not.toThrow()
  })

  it('retryAt é no futuro quando retryAfterMs > 0', () => {
    const before = Date.now()
    const env = rateLimitEnvelope(10000, 10, 0, 60000)
    const retryTs = new Date(env.retryAt).getTime()
    expect(retryTs).toBeGreaterThan(before)
  })
})

describe('liveStatusEnvelope (C13.3 / acessibilidade)', () => {
  it('contém todos os campos obrigatórios', () => {
    const env: LiveStatusEnvelope = liveStatusEnvelope('ok', 'Operacional', 'Sistema OK', null, 30000)
    expect(env.status).toBe('ok')
    expect(env.statusLabel).toBe('Operacional')
    expect(env.ariaLiveMessage).toBe('Sistema OK')
    expect(env.lastUpdatedAt).toBeNull()
    expect(env.pollAfter).toBe(30000)
  })

  it('ariaLiveMessage é string não-vazia (acessibilidade por tela)', () => {
    const env = liveStatusEnvelope('error', 'Degradado', 'Serviço degradado', null, 5000)
    expect(typeof env.ariaLiveMessage).toBe('string')
    expect(env.ariaLiveMessage.length).toBeGreaterThan(0)
  })

  it('correlationId opcional', () => {
    const with_ = liveStatusEnvelope('ok', 'OK', 'OK', null, 30000, 'corr-99')
    expect(with_.correlationId).toBe('corr-99')

    const without = liveStatusEnvelope('ok', 'OK', 'OK', null, 30000)
    expect(without).not.toHaveProperty('correlationId')
  })
})

// ---------------------------------------------------------------------------
// Contrato de regressão: campos obrigatórios nunca podem sumir
// ---------------------------------------------------------------------------

describe('contrato de regressão — campos obrigatórios', () => {
  it('successEnvelope: campo "data" nunca ausente', () => {
    const keys = Object.keys(successEnvelope(null))
    expect(keys).toContain('data')
  })

  it('errorEnvelope: campo "error.code" nunca ausente', () => {
    const env = errorEnvelope('CODE', 'msg')
    expect(env.error).toHaveProperty('code')
    expect(env.error.code).toBeTruthy()
  })

  it('errorEnvelope: campo "error.message" nunca ausente (semântica acessível)', () => {
    const env = errorEnvelope('CODE', 'msg')
    expect(env.error).toHaveProperty('message')
    expect(typeof env.error.message).toBe('string')
  })

  it('paginatedEnvelope: meta.total é número inteiro >= 0', () => {
    const meta = { page: 1, limit: 10, total: 0, hasNext: false, hasPrev: false }
    const env = paginatedEnvelope([], meta)
    expect(Number.isInteger(env.meta.total)).toBe(true)
    expect(env.meta.total).toBeGreaterThanOrEqual(0)
  })
})
