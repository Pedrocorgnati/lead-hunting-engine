/**
 * Testes de integração — Autenticação
 *
 * Módulo: POST /api/v1/auth/login, POST /api/v1/auth/logout,
 *         POST /api/v1/auth/reset-password, POST /api/v1/auth/update-password
 *
 * Estratégia: mock de @supabase/ssr para simular respostas do Supabase Auth.
 * O banco (UserProfile via Prisma) é acessado sem mock.
 *
 * Pré-requisito: seed de teste executado (bun run seed:test)
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

import { POST as loginRoute } from '@/app/api/v1/auth/login/route'
import { POST as logoutRoute } from '@/app/api/v1/auth/logout/route'
import { POST as resetPasswordRoute } from '@/app/api/v1/auth/reset-password/route'
import { createServerClient } from '@supabase/ssr'
import { makeRequest, parseResponseJson } from './helpers/request.helper'
import { TEST_IDS } from '../../prisma/seed/test'
import { prisma } from '@/lib/prisma'

// ─── Helpers de mock do Supabase ──────────────────────────────────────────────

function mockSupabaseSuccess(userId: string, email: string) {
  const mockClient = {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          user: { id: userId, email },
          session: { access_token: 'mock-token', refresh_token: 'mock-refresh' },
        },
        error: null,
      }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: jest.fn().mockResolvedValue({ data: {}, error: null }),
    },
  }
  ;(createServerClient as jest.Mock).mockReturnValue(mockClient)
  return mockClient
}

function mockSupabaseAuthError(status: number, message: string) {
  const mockClient = {
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { status, message },
      }),
    },
  }
  ;(createServerClient as jest.Mock).mockReturnValue(mockClient)
  return mockClient
}

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('[CENÁRIO 1] deve autenticar operador com credenciais válidas', async () => {
    mockSupabaseSuccess(TEST_IDS.OPERATOR, 'operator@test.local')

    const req = makeRequest('POST', '/api/v1/auth/login', {
      body: { email: 'operator@test.local', password: 'Test@Password123' },
    })

    const res = await loginRoute(req)
    const body = await parseResponseJson<{ user: { id: string; role: string } }>(res)

    expect(res.status).toBe(200)
    expect(body.user).toMatchObject({
      id: TEST_IDS.OPERATOR,
      role: 'OPERATOR',
      email: 'operator@test.local',
    })

    // Verificar que UserProfile existe no banco
    const dbProfile = await prisma.userProfile.findUnique({
      where: { id: TEST_IDS.OPERATOR },
    })
    expect(dbProfile).not.toBeNull()
    expect(dbProfile?.role).toBe('OPERATOR')
  })

  it('[CENÁRIO 2] deve retornar 401 com credenciais incorretas (AUTH_002)', async () => {
    mockSupabaseAuthError(401, 'Invalid login credentials')

    const req = makeRequest('POST', '/api/v1/auth/login', {
      body: { email: 'usuario@test.local', password: 'senha-errada' },
    })

    const res = await loginRoute(req)
    const body = await parseResponseJson<{ error: { code: string } }>(res)

    expect(res.status).toBe(401)
    expect(body.error.code).toBe('AUTH_002')

    // Mensagem não deve revelar qual campo está errado (THREAT-017)
    const bodyText = JSON.stringify(body)
    expect(bodyText).not.toContain('email')
    expect(bodyText).not.toContain('senha')
  })

  it('[CENÁRIO 2] deve retornar 422 com email inválido (VAL_002)', async () => {
    const req = makeRequest('POST', '/api/v1/auth/login', {
      body: { email: 'nao-e-email', password: 'qualquer' },
    })

    const res = await loginRoute(req)

    expect(res.status).toBe(422)
  })

  it('[CENÁRIO 2] deve retornar 422 com campos obrigatórios ausentes (VAL_001)', async () => {
    const req = makeRequest('POST', '/api/v1/auth/login', {
      body: { email: 'teste@test.local' }, // password ausente
    })

    const res = await loginRoute(req)

    expect(res.status).toBe(422)
  })

  it('[CENÁRIO 3] deve retornar 429 quando Supabase reporta rate limit (AUTH_003)', async () => {
    mockSupabaseAuthError(429, 'Too many requests. Wait 60 seconds.')

    const req = makeRequest('POST', '/api/v1/auth/login', {
      body: { email: 'ataque@test.local', password: 'forca-bruta' },
    })

    const res = await loginRoute(req)
    const body = await parseResponseJson<{ error: { code: string } }>(res)

    expect(res.status).toBe(429)
    expect(body.error.code).toBe('AUTH_003')
    expect(res.headers.get('Retry-After')).toBeDefined()
  })

  it('[CENÁRIO 4] resposta de erro NUNCA deve conter stack trace ou detalhes internos (SYS_001 / THREAT-011)', async () => {
    mockSupabaseAuthError(500, 'Internal server error at auth.go:142')

    const req = makeRequest('POST', '/api/v1/auth/login', {
      body: { email: 'teste@test.local', password: 'senha123' },
    })

    const res = await loginRoute(req)
    const body = await parseResponseJson(res)
    const bodyText = JSON.stringify(body)

    expect(bodyText).not.toContain('stack')
    expect(bodyText).not.toContain('auth.go')
    expect(bodyText).not.toContain('.ts:')
  })
})

// ─── POST /api/v1/auth/logout ─────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('[CENÁRIO 1] deve encerrar sessão autenticada com sucesso', async () => {
    const mockClient = { auth: { signOut: jest.fn().mockResolvedValue({ error: null }) } }
    ;(createServerClient as jest.Mock).mockReturnValue(mockClient)

    const res = await logoutRoute()

    expect(res.status).toBe(204)
    expect(mockClient.auth.signOut).toHaveBeenCalledTimes(1)
  })
})

// ─── POST /api/v1/auth/reset-password ────────────────────────────────────────

describe('POST /api/v1/auth/reset-password', () => {
  it('[CENÁRIO 1] deve retornar 200 mesmo para email inexistente (prevent user enumeration)', async () => {
    const mockClient = {
      auth: { resetPasswordForEmail: jest.fn().mockResolvedValue({ data: {}, error: null }) },
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mockClient)

    const req = makeRequest('POST', '/api/v1/auth/reset-password', {
      body: { email: 'nao-existe@test.local' },
    })

    const res = await resetPasswordRoute(req)

    // SEMPRE 200 — nunca revelar se email existe (THREAT-017)
    expect(res.status).toBe(200)
  })

  it('[CENÁRIO 2] deve retornar 422 com email inválido', async () => {
    const req = makeRequest('POST', '/api/v1/auth/reset-password', {
      body: { email: 'formato-invalido' },
    })

    const res = await resetPasswordRoute(req)

    expect(res.status).toBe(422)
  })
})
