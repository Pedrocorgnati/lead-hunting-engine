/**
 * R-11 intake-review: testes do endpoint verify-password.
 * Cobre 200 (senha correta), 401 (invalida), 429 (rate-limit user/ip), e
 * garante que rate-limit por-IP (R-13) dispara horizontal credential stuffing.
 */
const requireAuthMock = jest.fn()
jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual<typeof import('@/lib/auth')>('@/lib/auth')
  return {
    ...actual,
    requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  }
})

const signInMock = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { signInWithPassword: signInMock },
  })),
}))

// Mock rate-limiter — preserva RateLimitError para handleApiError mapear 429.
const authVerifyMock = jest.fn()
const authVerifyByIpMock = jest.fn()
jest.mock('@/lib/rate-limiter', () => {
  const actual = jest.requireActual<typeof import('@/lib/rate-limiter')>('@/lib/rate-limiter')
  return {
    ...actual,
    limits: {
      authVerify: (...a: unknown[]) => authVerifyMock(...a),
      authVerifyByIp: (...a: unknown[]) => authVerifyByIpMock(...a),
    },
  }
})

import { NextRequest } from 'next/server'
import { POST } from '../route'
import { RateLimitError } from '@/lib/rate-limiter'

function mkReq(body: unknown, ip = '1.2.3.4'): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/auth/verify-password'), {
    method: 'POST',
    headers: {
      'x-forwarded-for': ip,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  requireAuthMock.mockResolvedValue({ id: 'user-1', email: 'user@test.com', role: 'OPERATOR' })
  signInMock.mockResolvedValue({ error: null })
  authVerifyMock.mockImplementation(() => undefined)
  authVerifyByIpMock.mockImplementation(() => undefined)
})

describe('POST /api/v1/auth/verify-password', () => {
  it('200 on correct password', async () => {
    const res = await POST(mkReq({ currentPassword: 'mycurrentpass' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.ok).toBe(true)
    expect(signInMock).toHaveBeenCalledWith({
      email: 'user@test.com',
      password: 'mycurrentpass',
    })
  })

  it('401 when Supabase returns error', async () => {
    signInMock.mockResolvedValue({ error: { message: 'invalid credentials' } })
    const res = await POST(mkReq({ currentPassword: 'wrongpass' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('AUTH_002')
  })

  it('applies BOTH rate limits — per-user and per-IP (R-13)', async () => {
    await POST(mkReq({ currentPassword: 'pw' }))
    expect(authVerifyMock).toHaveBeenCalledWith('user-1')
    expect(authVerifyByIpMock).toHaveBeenCalledWith('1.2.3.4')
  })

  it('429 when per-user rate-limit throws', async () => {
    authVerifyMock.mockImplementation(() => {
      throw new RateLimitError('rate limit exceeded for auth-verify:user:user-1', 42, 1700000000)
    })
    const res = await POST(mkReq({ currentPassword: 'pw' }))
    expect(res.status).toBe(429)
  })

  it('429 when per-IP rate-limit throws (horizontal stuffing blocked)', async () => {
    authVerifyMock.mockImplementation(() => undefined)
    authVerifyByIpMock.mockImplementation(() => {
      throw new RateLimitError('rate limit exceeded for auth-verify:ip:1.2.3.4', 30, 1700000000)
    })
    const res = await POST(mkReq({ currentPassword: 'pw' }))
    expect(res.status).toBe(429)
  })

  it('400 on zod validation failure (short password)', async () => {
    const res = await POST(mkReq({ currentPassword: 'x' }))
    // handleApiError deve mapear ZodError para 400 — aceitamos 400 ou 422
    expect([400, 422]).toContain(res.status)
  })
})
