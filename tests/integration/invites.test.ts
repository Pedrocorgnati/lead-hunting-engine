/**
 * Testes de integração — Convites (rotas públicas)
 *
 * Módulo: GET /api/v1/invites/[token] (validar token)
 *         POST /api/v1/invites/[token]/activate (ativar conta)
 *
 * Rotas públicas — sem autenticação necessária.
 * Pré-requisito: seed de teste executado (bun run seed:test)
 *
 * Test seed invites:
 *   INVITE_PENDING  = 00000000-0000-0000-0000-000000000040 (token: test-token-pending)
 *   INVITE_EXPIRED  = 00000000-0000-0000-0000-000000000041 (token: test-token-expired)
 *   INVITE_REVOKED  = 00000000-0000-0000-0000-000000000042 (token: test-token-revoked)
 */

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    getAll: jest.fn().mockReturnValue([]),
    set: jest.fn(),
  }),
}))

import { GET as validateToken } from '@/app/api/v1/invites/[token]/route'
import { POST as activateAccount } from '@/app/api/v1/invites/[token]/activate/route'
import { createServerClient } from '@supabase/ssr'
import { makeRequest, makeRouteContext, parseResponseJson } from './helpers/request.helper'
import { prisma } from '@/lib/prisma'

// ─── GET /api/v1/invites/[token] ──────────────────────────────────────────────

describe('GET /api/v1/invites/[token]', () => {
  it('[CENÁRIO 1] deve validar token de convite PENDING com sucesso', async () => {
    const req = makeRequest('GET', '/api/v1/invites/test-token-pending')
    const ctx = makeRouteContext({ token: 'test-token-pending' })
    const res = await validateToken(req, ctx)
    const body = await parseResponseJson<{
      data: { email: string; role: string; expiresAt: string }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({
      email: expect.any(String),
      role: 'OPERATOR',
      expiresAt: expect.any(String),
    })
  })

  it('[CENÁRIO 2] deve retornar 410 para convite EXPIRADO (INVITE_050)', async () => {
    const req = makeRequest('GET', '/api/v1/invites/test-token-expired')
    const ctx = makeRouteContext({ token: 'test-token-expired' })
    const res = await validateToken(req, ctx)
    const body = await parseResponseJson<{ error: { code: string } }>(res)

    expect(res.status).toBe(410)
    expect(body.error.code).toBe('INVITE_050')
  })

  it('[CENÁRIO 2] deve retornar 404 para token inexistente (INVITE_080)', async () => {
    const req = makeRequest('GET', '/api/v1/invites/token-invalido-xyz')
    const ctx = makeRouteContext({ token: 'token-invalido-xyz' })
    const res = await validateToken(req, ctx)
    const body = await parseResponseJson<{ error: { code: string } }>(res)

    expect(res.status).toBe(404)
    expect(body.error.code).toBe('INVITE_080')
  })

  it('[CENÁRIO 4] deve retornar 404 para SQL injection attempt (THREAT-INVITE — enum token)', async () => {
    const maliciousToken = "'; DROP TABLE invites; --"
    const req = makeRequest('GET', `/api/v1/invites/${encodeURIComponent(maliciousToken)}`)
    const ctx = makeRouteContext({ token: maliciousToken })
    const res = await validateToken(req, ctx)

    // Deve retornar 404 (token não existe) sem expor detalhes internos
    expect(res.status).toBe(404)

    // Verificar que a tabela ainda existe
    const count = await prisma.invite.count()
    expect(count).toBeGreaterThan(0)
  })
})

// ─── POST /api/v1/invites/[token]/activate ────────────────────────────────────

describe('POST /api/v1/invites/[token]/activate', () => {
  // Mock Supabase para simular criação de usuário e login
  function mockSupabaseActivation(userId: string) {
    const mockClient = {
      auth: {
        admin: {
          createUser: jest.fn().mockResolvedValue({
            data: { user: { id: userId } },
            error: null,
          }),
        },
        signInWithPassword: jest.fn().mockResolvedValue({
          data: {
            user: { id: userId },
            session: { access_token: 'mock-token' },
          },
          error: null,
        }),
      },
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mockClient)
    return mockClient
  }

  it('[CENÁRIO 2] deve retornar 400 se termsAccepted = false (INVITE_022 — LGPD)', async () => {
    const req = makeRequest('POST', '/api/v1/invites/test-token-pending/activate', {
      body: { password: 'Senha@123456', termsAccepted: false },
    })
    const ctx = makeRouteContext({ token: 'test-token-pending' })
    const res = await activateAccount(req, ctx)

    expect(res.status).toBe(400)
    const body = await parseResponseJson<{ error: { code: string } }>(res)
    expect(body.error.code).toBe('INVITE_022')
  })

  it('[CENÁRIO 2] deve retornar 422 com senha muito curta (VAL_003)', async () => {
    const req = makeRequest('POST', '/api/v1/invites/test-token-pending/activate', {
      body: { password: '123', termsAccepted: true },
    })
    const ctx = makeRouteContext({ token: 'test-token-pending' })
    const res = await activateAccount(req, ctx)

    expect(res.status).toBe(422)
  })

  it('[CENÁRIO 2] deve retornar 410 ao tentar ativar convite EXPIRADO (INVITE_050)', async () => {
    const req = makeRequest('POST', '/api/v1/invites/test-token-expired/activate', {
      body: { password: 'Senha@ValidA123', termsAccepted: true },
    })
    const ctx = makeRouteContext({ token: 'test-token-expired' })
    const res = await activateAccount(req, ctx)

    expect(res.status).toBe(410)
    const body = await parseResponseJson<{ error: { code: string } }>(res)
    expect(body.error.code).toBe('INVITE_050')
  })

  it('[CENÁRIO 2] deve retornar 410 ao tentar ativar convite REVOGADO', async () => {
    const req = makeRequest('POST', '/api/v1/invites/test-token-revoked/activate', {
      body: { password: 'Senha@ValidA123', termsAccepted: true },
    })
    const ctx = makeRouteContext({ token: 'test-token-revoked' })
    const res = await activateAccount(req, ctx)

    expect(res.status).toBe(410)
  })

  it('[CENÁRIO 2] deve retornar 404 para token inexistente', async () => {
    const req = makeRequest('POST', '/api/v1/invites/token-que-nao-existe/activate', {
      body: { password: 'Senha@ValidA123', termsAccepted: true },
    })
    const ctx = makeRouteContext({ token: 'token-que-nao-existe' })
    const res = await activateAccount(req, ctx)

    expect(res.status).toBe(404)
  })
})
