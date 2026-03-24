/**
 * Testes de integração — Perfil do Usuário
 *
 * Módulo: GET /api/v1/profile, PATCH /api/v1/profile,
 *         POST /api/v1/profile/deletion-request, GET /api/v1/profile/data-export
 *
 * Pré-requisito: seed de teste executado (bun run seed:test)
 */

jest.mock('@/lib/auth')

import { GET as getProfile, PATCH as patchProfile } from '@/app/api/v1/profile/route'
import { POST as requestDeletion } from '@/app/api/v1/profile/deletion-request/route'
import { GET as dataExport } from '@/app/api/v1/profile/data-export/route'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { makeRequest, parseResponseJson } from './helpers/request.helper'
import { setupAuthMock, setupUnauthenticatedMock, TEST_USERS } from './helpers/auth.helper'
import { buildUpdateProfilePayload } from './helpers/factory.helper'
import { resetDeletionRequest } from './helpers/db.helper'
import { TEST_IDS } from '../../prisma/seed/test'
import { prisma } from '@/lib/prisma'

// ─── GET /api/v1/profile ──────────────────────────────────────────────────────

describe('GET /api/v1/profile', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  it('[CENÁRIO 1] deve retornar perfil do operador autenticado', async () => {
    const req = makeRequest('GET', '/api/v1/profile')
    const res = await getProfile(req)
    const body = await parseResponseJson<{ data: { id: string; role: string; email: string } }>(res)

    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({
      id: TEST_IDS.OPERATOR,
      email: 'operator@test.local',
      role: 'OPERATOR',
    })

    // Verificar que dados sensíveis NÃO estão expostos
    expect(JSON.stringify(body)).not.toContain('password')
    expect(JSON.stringify(body)).not.toContain('encrypted')
  })

  it('[CENÁRIO 3] deve retornar 401 sem autenticação (AUTH_001)', async () => {
    setupUnauthenticatedMock(requireAuth as jest.Mock)

    const req = makeRequest('GET', '/api/v1/profile')
    const res = await getProfile(req)
    const body = await parseResponseJson<{ error: { code: string } }>(res)

    expect(res.status).toBe(401)
    expect(body.error.code).toBe('AUTH_001')
  })
})

// ─── PATCH /api/v1/profile ────────────────────────────────────────────────────

describe('PATCH /api/v1/profile', () => {
  const originalName = 'Operator Test'

  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  afterEach(async () => {
    // Restaurar nome original após testes que alteram o perfil
    await prisma.userProfile.update({
      where: { id: TEST_IDS.OPERATOR },
      data: { name: originalName },
    })
  })

  it('[CENÁRIO 1] deve atualizar nome do operador com sucesso', async () => {
    const payload = buildUpdateProfilePayload({ name: 'Novo Nome de Teste' })

    const req = makeRequest('PATCH', '/api/v1/profile', { body: payload })
    const res = await patchProfile(req)
    const body = await parseResponseJson<{ data: { name: string; id: string } }>(res)

    expect(res.status).toBe(200)
    expect(body.data.name).toBe('Novo Nome de Teste')
    expect(body.data.id).toBe(TEST_IDS.OPERATOR)

    // Verificar persistência no banco
    const dbProfile = await prisma.userProfile.findUnique({
      where: { id: TEST_IDS.OPERATOR },
    })
    expect(dbProfile?.name).toBe('Novo Nome de Teste')
  })

  it('[CENÁRIO 1] deve permitir remover avatar (avatarUrl: null — LGPD Art. 18, VIII)', async () => {
    const req = makeRequest('PATCH', '/api/v1/profile', {
      body: { avatarUrl: null },
    })

    const res = await patchProfile(req)

    expect(res.status).toBe(200)
  })

  it('[CENÁRIO 2] deve retornar 400 quando role é enviado no body (THREAT-012 — privilege escalation)', async () => {
    const req = makeRequest('PATCH', '/api/v1/profile', {
      body: { role: 'ADMIN' }, // tentativa de escalação
    })

    const res = await patchProfile(req)

    expect(res.status).toBe(400)

    // Garantir que role NÃO foi alterado
    const dbProfile = await prisma.userProfile.findUnique({
      where: { id: TEST_IDS.OPERATOR },
    })
    expect(dbProfile?.role).toBe('OPERATOR') // role mantido
  })

  it('[CENÁRIO 2] deve retornar 422 com nome vazio', async () => {
    const req = makeRequest('PATCH', '/api/v1/profile', {
      body: { name: '' },
    })

    const res = await patchProfile(req)

    expect(res.status).toBe(422)
  })

  it('[CENÁRIO 3] deve retornar 401 sem autenticação', async () => {
    setupUnauthenticatedMock(requireAuth as jest.Mock)

    const req = makeRequest('PATCH', '/api/v1/profile', {
      body: { name: 'Teste' },
    })
    const res = await patchProfile(req)

    expect(res.status).toBe(401)
  })
})

// ─── POST /api/v1/profile/deletion-request ────────────────────────────────────

describe('POST /api/v1/profile/deletion-request', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  afterEach(async () => {
    // Limpar solicitação de exclusão para não afetar outros testes
    await resetDeletionRequest(TEST_IDS.OPERATOR)
  })

  it('[CENÁRIO 1] deve registrar solicitação de exclusão (LGPD Art. 18, IV)', async () => {
    const req = makeRequest('POST', '/api/v1/profile/deletion-request')
    const res = await requestDeletion(req)
    const body = await parseResponseJson<{ message: string }>(res)

    expect(res.status).toBe(200)
    expect(body.message).toBeDefined()

    // Verificar que deletionRequestedAt foi preenchido no banco
    const dbProfile = await prisma.userProfile.findUnique({
      where: { id: TEST_IDS.OPERATOR },
    })
    expect(dbProfile?.deletionRequestedAt).not.toBeNull()
  })

  it('[CENÁRIO 2] deve retornar 409 se solicitação já registrada (USER_050)', async () => {
    // Primeira solicitação
    await requestDeletion(makeRequest('POST', '/api/v1/profile/deletion-request'))

    // Segunda solicitação — deve retornar 409
    const req = makeRequest('POST', '/api/v1/profile/deletion-request')
    const res = await requestDeletion(req)
    const body = await parseResponseJson<{ error: { code: string } }>(res)

    expect(res.status).toBe(409)
    expect(body.error.code).toBe('USER_050')
  })
})

// ─── GET /api/v1/profile/data-export ─────────────────────────────────────────

describe('GET /api/v1/profile/data-export', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  it('[CENÁRIO 1] deve retornar exportação completa dos dados do usuário (LGPD Art. 18, II)', async () => {
    const req = makeRequest('GET', '/api/v1/profile/data-export')
    const res = await dataExport(req)
    const body = await parseResponseJson<{
      data: {
        exportedAt: string
        userProfile: { id: string }
        collectionJobs: unknown[]
        leads: unknown[]
      }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.data.exportedAt).toBeDefined()
    expect(body.data.userProfile).toMatchObject({ id: TEST_IDS.OPERATOR })
    expect(Array.isArray(body.data.collectionJobs)).toBe(true)
    expect(Array.isArray(body.data.leads)).toBe(true)
  })

  it('[CENÁRIO 3] deve retornar 401 sem autenticação', async () => {
    setupUnauthenticatedMock(requireAuth as jest.Mock)

    const req = makeRequest('GET', '/api/v1/profile/data-export')
    const res = await dataExport(req)

    expect(res.status).toBe(401)
  })
})
