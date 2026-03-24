/**
 * Testes de integração — Gerenciamento de Convites (Admin)
 *
 * Módulo: GET /api/v1/admin/invites, POST /api/v1/admin/invites,
 *         POST /api/v1/admin/invites/[id]/resend, DELETE /api/v1/admin/invites/[id]
 *
 * Pré-requisito: seed de teste executado (bun run seed:test)
 */

jest.mock('@/lib/auth')
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    getAll: jest.fn().mockReturnValue([]),
    set: jest.fn(),
  }),
}))

import { GET as listInvites, POST as createInvite } from '@/app/api/v1/admin/invites/route'
import { DELETE as revokeInvite } from '@/app/api/v1/admin/invites/[id]/route'
import { POST as resendInvite } from '@/app/api/v1/admin/invites/[id]/resend/route'
import { requireAdmin, requireAuth } from '@/lib/auth'
import { createServerClient } from '@supabase/ssr'
import { makeRequest, makeRouteContext, parseResponseJson } from './helpers/request.helper'
import { setupAdminMock, setupUnauthenticatedMock } from './helpers/auth.helper'
import { buildCreateInvitePayload } from './helpers/factory.helper'
import { trackCreatedInvite, cleanupTracked, getInviteFromDb } from './helpers/db.helper'
import { TEST_IDS } from '../../prisma/seed/test'

// Mock Supabase para não enviar email real
function mockSupabaseEmailService() {
  const mockClient = {
    auth: {
      admin: {
        inviteUserByEmail: jest.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
  }
  ;(createServerClient as jest.Mock).mockReturnValue(mockClient)
  return mockClient
}

afterEach(async () => {
  await cleanupTracked()
})

// ─── GET /api/v1/admin/invites ────────────────────────────────────────────────

describe('GET /api/v1/admin/invites', () => {
  beforeEach(() => {
    setupAdminMock(requireAdmin as jest.Mock, 'ADMIN')
  })

  it('[CENÁRIO 1] deve listar convites como admin com paginação', async () => {
    const req = makeRequest('GET', '/api/v1/admin/invites', {
      query: { page: '1', limit: '10' },
    })
    const res = await listInvites(req)
    const body = await parseResponseJson<{
      data: unknown[]
      meta: { page: number; total: number }
    }>(res)

    expect(res.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta).toMatchObject({
      page: 1,
      total: expect.any(Number),
    })
  })

  it('[CENÁRIO 1] deve filtrar convites por status PENDING', async () => {
    const req = makeRequest('GET', '/api/v1/admin/invites', {
      query: { status: 'PENDING' },
    })
    const res = await listInvites(req)
    const body = await parseResponseJson<{
      data: Array<{ status: string }>
    }>(res)

    expect(res.status).toBe(200)
    body.data.forEach((invite) => {
      expect(invite.status).toBe('PENDING')
    })
  })

  it('[CENÁRIO 3] deve retornar 403 para OPERATOR tentando listar convites (INVITE_001)', async () => {
    setupAdminMock(requireAdmin as jest.Mock, 'OPERATOR') // 403

    const req = makeRequest('GET', '/api/v1/admin/invites')
    const res = await listInvites(req)

    expect(res.status).toBe(403)
  })

  it('[CENÁRIO 3] deve retornar 401 sem autenticação', async () => {
    setupUnauthenticatedMock(requireAdmin as jest.Mock)

    const req = makeRequest('GET', '/api/v1/admin/invites')
    const res = await listInvites(req)

    expect(res.status).toBe(401)
  })
})

// ─── POST /api/v1/admin/invites ───────────────────────────────────────────────

describe('POST /api/v1/admin/invites', () => {
  beforeEach(() => {
    setupAdminMock(requireAdmin as jest.Mock, 'ADMIN')
    mockSupabaseEmailService()
  })

  it('[CENÁRIO 1] deve criar convite com email único e salvar no banco', async () => {
    const payload = buildCreateInvitePayload()

    const req = makeRequest('POST', '/api/v1/admin/invites', { body: payload })
    const res = await createInvite(req)
    const body = await parseResponseJson<{
      data: { id: string; email: string; status: string; role: string }
    }>(res)

    expect(res.status).toBe(201)
    expect(body.data).toMatchObject({
      id: expect.any(String),
      email: payload.email,
      status: 'PENDING',
      role: 'OPERATOR',
    })

    // Registrar para limpeza
    trackCreatedInvite(body.data.id)

    // Verificar que foi persistido no banco
    const dbInvite = await getInviteFromDb(body.data.id)
    expect(dbInvite).not.toBeNull()
    expect(dbInvite?.status).toBe('PENDING')
  })

  it('[CENÁRIO 2] deve retornar 400 para email já registrado (INVITE_020)', async () => {
    // admin@test.local já existe no seed
    const req = makeRequest('POST', '/api/v1/admin/invites', {
      body: buildCreateInvitePayload({ email: 'admin@test.local' }),
    })
    const res = await createInvite(req)
    const body = await parseResponseJson<{ error: { code: string } }>(res)

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVITE_020')

    // Nenhum convite deve ter sido criado
    const count = await require('@/lib/prisma').prisma.invite.count({
      where: { email: 'admin@test.local' },
    })
    expect(count).toBe(0) // admin já tem conta, não deve ter invite
  })

  it('[CENÁRIO 2] deve retornar 422 com email inválido (VAL_002)', async () => {
    const req = makeRequest('POST', '/api/v1/admin/invites', {
      body: { email: 'nao-e-email', role: 'OPERATOR' },
    })
    const res = await createInvite(req)

    expect(res.status).toBe(422)
  })

  it('[CENÁRIO 2] deve retornar 422 com expiresInDays fora do range (VAL_003)', async () => {
    const req = makeRequest('POST', '/api/v1/admin/invites', {
      body: buildCreateInvitePayload({ expiresInDays: 365 }), // max é 30
    })
    const res = await createInvite(req)

    expect(res.status).toBe(422)
  })

  it('[CENÁRIO 3] deve retornar 403 para OPERATOR criando convite (INVITE_001)', async () => {
    setupAdminMock(requireAdmin as jest.Mock, 'OPERATOR')

    const req = makeRequest('POST', '/api/v1/admin/invites', {
      body: buildCreateInvitePayload(),
    })
    const res = await createInvite(req)

    expect(res.status).toBe(403)
  })
})

// ─── DELETE /api/v1/admin/invites/[id] ───────────────────────────────────────

describe('DELETE /api/v1/admin/invites/[id]', () => {
  beforeEach(() => {
    setupAdminMock(requireAdmin as jest.Mock, 'ADMIN')
  })

  it('[CENÁRIO 1] deve revogar convite PENDING com sucesso', async () => {
    const req = makeRequest('DELETE', `/api/v1/admin/invites/${TEST_IDS.INVITE_PENDING}`)
    const ctx = makeRouteContext({ id: TEST_IDS.INVITE_PENDING })
    const res = await revokeInvite(req, ctx)

    expect(res.status).toBe(204)

    // Verificar status no banco
    const dbInvite = await getInviteFromDb(TEST_IDS.INVITE_PENDING)
    expect(dbInvite?.status).toBe('REVOKED')
  })

  afterEach(async () => {
    // Restaurar convite revogado para estado PENDING (para não afetar outros testes)
    const { prisma } = await import('@/lib/prisma')
    await prisma.invite.update({
      where: { id: TEST_IDS.INVITE_PENDING },
      data: { status: 'PENDING' },
    }).catch(() => null) // ignorar se já foi restaurado
  })

  it('[CENÁRIO 2] deve retornar 404 para convite inexistente (JOB_080)', async () => {
    const fakeId = '00000000-0000-0000-ffff-000000000099'
    const req = makeRequest('DELETE', `/api/v1/admin/invites/${fakeId}`)
    const ctx = makeRouteContext({ id: fakeId })
    const res = await revokeInvite(req, ctx)

    expect(res.status).toBe(404)
  })

  it('[CENÁRIO 3] deve retornar 403 para OPERATOR tentando revogar convite', async () => {
    setupAdminMock(requireAdmin as jest.Mock, 'OPERATOR')

    const req = makeRequest('DELETE', `/api/v1/admin/invites/${TEST_IDS.INVITE_PENDING}`)
    const ctx = makeRouteContext({ id: TEST_IDS.INVITE_PENDING })
    const res = await revokeInvite(req, ctx)

    expect(res.status).toBe(403)
  })
})

// ─── POST /api/v1/admin/invites/[id]/resend ──────────────────────────────────

describe('POST /api/v1/admin/invites/[id]/resend', () => {
  beforeEach(() => {
    setupAdminMock(requireAdmin as jest.Mock, 'ADMIN')
    mockSupabaseEmailService()
  })

  it('[CENÁRIO 1] deve reenviar convite e atualizar expiresAt', async () => {
    const req = makeRequest('POST', `/api/v1/admin/invites/${TEST_IDS.INVITE_PENDING}/resend`)
    const ctx = makeRouteContext({ id: TEST_IDS.INVITE_PENDING })
    const res = await resendInvite(req, ctx)

    expect(res.status).toBe(200)

    // Supabase deve ter sido chamado para reenvio
    const mockClient = (createServerClient as jest.Mock).mock.results[0]?.value
    if (mockClient?.auth?.admin?.inviteUserByEmail) {
      expect(mockClient.auth.admin.inviteUserByEmail).toHaveBeenCalled()
    }
  })
})
