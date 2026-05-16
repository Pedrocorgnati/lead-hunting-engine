/**
 * Integration tests — Feature flag SSR override via cookie.
 *
 * Cobre: TASK-5/ST003 (CL-565).
 *
 * Testa:
 *   - parseOverrideCookie: unitario puro (sem Next.js)
 *   - isOverrideAllowed: verificacao de ambiente
 *   - Endpoint POST /api/v1/feature-flags/resolve com cookie override
 */

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    getAll: jest.fn().mockReturnValue([]),
    get: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
  }),
}))

jest.mock('@/lib/auth', () => ({
  getAuthenticatedUser: jest.fn().mockResolvedValue({
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'OPERATOR',
  }),
}))

jest.mock('@/lib/feature-flags/provider', () => ({
  resolveBatchInProvider: jest.fn().mockResolvedValue({}),
}))

import { parseOverrideCookie, isOverrideAllowed } from '@/lib/feature-flags/cookie-override'
import { POST as resolveRoute } from '@/app/api/v1/feature-flags/resolve/route'
import { makeRequest, parseResponseJson } from '../helpers/request.helper'

// ─── parseOverrideCookie (unitarios puros) ─────────────────────────────────

describe('parseOverrideCookie', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true })
  })

  it('retorna {} quando valor e undefined', () => {
    expect(parseOverrideCookie(undefined)).toEqual({})
  })

  it('retorna {} quando valor e string vazia', () => {
    expect(parseOverrideCookie('')).toEqual({})
  })

  it('faz parse de JSON valido em staging', () => {
    // NODE_ENV e 'test' em jest — nao e 'production', entao override e permitido
    expect(parseOverrideCookie('{"new_dashboard":true}')).toEqual({ new_dashboard: true })
    expect(parseOverrideCookie('{"feature_a":true,"feature_b":false}')).toEqual({
      feature_a: true,
      feature_b: false,
    })
  })

  it('retorna {} para JSON invalido', () => {
    expect(parseOverrideCookie('not-json')).toEqual({})
    expect(parseOverrideCookie('{invalid}')).toEqual({})
  })

  it('retorna {} para schema invalido (valores nao-boolean)', () => {
    expect(parseOverrideCookie('{"flag":"string-value"}')).toEqual({})
    expect(parseOverrideCookie('{"flag":123}')).toEqual({})
  })

  it('faz decode de URI encoding', () => {
    const encoded = encodeURIComponent('{"x":true}')
    expect(parseOverrideCookie(encoded)).toEqual({ x: true })
  })
})

// ─── isOverrideAllowed ─────────────────────────────────────────────────────

describe('isOverrideAllowed', () => {
  it('retorna true em ambiente de teste (NODE_ENV=test)', () => {
    // Jest roda com NODE_ENV=test por padrao
    expect(isOverrideAllowed()).toBe(true)
  })
})

// ─── Endpoint com cookie override ──────────────────────────────────────────

describe('POST /api/v1/feature-flags/resolve com cookie override', () => {
  it('retorna true para flag quando cookie ff_override presente e staging', async () => {
    const overrideCookieValue = encodeURIComponent(JSON.stringify({ 'test.flag.example': true }))
    const req = makeRequest('POST', '/api/v1/feature-flags/resolve', {
      body: { names: ['test.flag.example'] },
      headers: { cookie: `ff_override=${overrideCookieValue}` },
    })

    const res = await resolveRoute(req as unknown as Parameters<typeof resolveRoute>[0])
    const body = await parseResponseJson<{ data: { flags: Record<string, boolean> } }>(res)

    expect(res.status).toBe(200)
    expect(body.data.flags['test.flag.example']).toBe(true)
  })

  it('retorna valor do provider quando cookie nao presente', async () => {
    const { resolveBatchInProvider } = require('@/lib/feature-flags/provider')
    ;(resolveBatchInProvider as jest.Mock).mockResolvedValueOnce({
      'test.flag.example': false,
    })

    const req = makeRequest('POST', '/api/v1/feature-flags/resolve', {
      body: { names: ['test.flag.example'] },
    })

    const res = await resolveRoute(req as unknown as Parameters<typeof resolveRoute>[0])
    const body = await parseResponseJson<{ data: { flags: Record<string, boolean> } }>(res)

    expect(body.data.flags['test.flag.example']).toBe(false)
  })
})
