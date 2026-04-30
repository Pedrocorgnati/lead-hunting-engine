/**
 * TASK-AUDIT-2 / G2-001 — testes do rate-limit IP+email custom em /login.
 * Cobre:
 *   - 401 para credenciais invalidas (Supabase erro)
 *   - Bucket fino (par IP+email): 5 tentativas OK, 6a -> 429 com Retry-After
 *   - Bucket grosseiro (IP): 20 tentativas OK distribuidas em emails diferentes,
 *     21a -> 429 (anti horizontal credential stuffing)
 *   - Email case-insensitive: User@X.com e user@x.com compartilham bucket
 *   - 429 nativo do Supabase (>= 6a tentativa em janela superior) ainda e
 *     mapeado para AUTH_003 com Retry-After
 *   - Audit (LoginAttempt) gravado mesmo em rate-limit (success=false)
 */

const supabaseSignInMock = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { signInWithPassword: supabaseSignInMock },
  })),
}))

const loginAttemptCreateMock = jest.fn().mockResolvedValue({})
const userProfileFindUniqueMock = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    loginAttempt: { create: (...args: unknown[]) => loginAttemptCreateMock(...args) },
    userProfile: { findUnique: (...args: unknown[]) => userProfileFindUniqueMock(...args) },
  },
}))

import { NextRequest } from 'next/server'
import { POST } from '../route'

function mkReq(body: unknown, ip = '203.0.113.1'): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/auth/login'), {
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
  // Limpa store in-memory do rate-limiter entre suites: como o store e module-level
  // e nao expomos clear, geramos chaves unicas por suite via IPs distintos.
  supabaseSignInMock.mockResolvedValue({
    data: { user: { id: 'user-1' }, session: { access_token: 'tok' } },
    error: null,
  })
  userProfileFindUniqueMock.mockResolvedValue({ id: 'user-1', email: 'user@x.com' })
})

describe('POST /api/v1/auth/login — rate limit (TASK-AUDIT-2)', () => {
  it('retorna 401 quando Supabase rejeita credencial', async () => {
    supabaseSignInMock.mockResolvedValue({ data: null, error: { message: 'invalid', status: 400 } })
    const res = await POST(mkReq({ email: 'a@x.com', password: 'bad-password' }, '203.0.113.10'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('AUTH_002')
  })

  it('bucket fino (IP+email): 5 tentativas OK, 6a retorna 429 com Retry-After', async () => {
    supabaseSignInMock.mockResolvedValue({ data: null, error: { message: 'invalid', status: 400 } })
    const ip = '203.0.113.11'
    const email = 'pair@x.com'

    // 5 tentativas erradas — todas devem chegar ao Supabase e retornar 401.
    for (let i = 0; i < 5; i++) {
      const res = await POST(mkReq({ email, password: 'wrong' }, ip))
      expect(res.status).toBe(401)
    }

    // 6a deve ser barrada pelo rate-limit local antes do Supabase.
    const res6 = await POST(mkReq({ email, password: 'wrong' }, ip))
    expect(res6.status).toBe(429)
    expect(res6.headers.get('Retry-After')).toBeTruthy()
    const body = await res6.json()
    expect(body.error.code).toBe('AUTH_003')

    // Audit: LoginAttempt foi gravado nas 5 falhas + na 6a (rate-limited).
    expect(loginAttemptCreateMock).toHaveBeenCalledTimes(6)
    const lastCallArgs = loginAttemptCreateMock.mock.calls[5][0]
    expect(lastCallArgs.data.success).toBe(false)
    expect(lastCallArgs.data.ipAddress).toBe(ip)
  })

  it('bucket grosseiro (IP): 21a tentativa do mesmo IP em emails diferentes retorna 429', async () => {
    supabaseSignInMock.mockResolvedValue({ data: null, error: { message: 'invalid', status: 400 } })
    const ip = '203.0.113.12'

    // 20 tentativas em 20 emails diferentes — bucket fino nao dispara,
    // bucket grosseiro vai ate o limite de 20.
    for (let i = 0; i < 20; i++) {
      const res = await POST(mkReq({ email: `victim${i}@x.com`, password: 'wrong' }, ip))
      expect(res.status).toBe(401)
    }

    // 21a do mesmo IP em qualquer email novo deve cair no bucket grosseiro.
    const res21 = await POST(mkReq({ email: 'victim21@x.com', password: 'wrong' }, ip))
    expect(res21.status).toBe(429)
    expect(res21.headers.get('Retry-After')).toBeTruthy()
  })

  it('email e case-insensitive no bucket fino — mesmo bucket para User@X.com e user@x.com', async () => {
    supabaseSignInMock.mockResolvedValue({ data: null, error: { message: 'invalid', status: 400 } })
    const ip = '203.0.113.13'

    // 5 tentativas alternando casing — devem todas cair no MESMO bucket.
    // (Zod rejeita whitespace antes do nosso normalize; foco aqui e case folding.)
    const variants = [
      'user@x.com',
      'User@X.com',
      'USER@X.COM',
      'user@X.com',
      'user@x.com',
    ]
    for (const email of variants) {
      const res = await POST(mkReq({ email, password: 'wrong' }, ip))
      expect(res.status).toBe(401)
    }

    // 6a tentativa em qualquer casing -> 429.
    const res = await POST(mkReq({ email: 'USER@x.com', password: 'wrong' }, ip))
    expect(res.status).toBe(429)
  })

  it('429 nativo do Supabase tambem e mapeado para AUTH_003 com Retry-After', async () => {
    // Simula Supabase respondendo 429 (rate-limit do provider) — fluxo deve cair
    // no path existente que mapeia para AUTH_003. Usar IP novo para nao colidir
    // com buckets das suites anteriores.
    supabaseSignInMock.mockResolvedValue({
      data: null,
      error: { message: 'rate limit exceeded — try again in 42 seconds', status: 429 },
    })
    const res = await POST(mkReq({ email: 'fresh@x.com', password: 'wrong' }, '203.0.113.14'))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    const body = await res.json()
    expect(body.error.code).toBe('AUTH_003')
  })
})
