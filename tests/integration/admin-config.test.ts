/**
 * Testes de integração — Configurações Admin
 *
 * Módulo: GET /api/v1/admin/config/credentials,
 *         PUT /api/v1/admin/config/credentials/[provider],
 *         DELETE /api/v1/admin/config/credentials/[provider],
 *         GET /api/v1/admin/config/scoring-rules,
 *         PUT /api/v1/admin/config/scoring-rules/[id]
 *
 * ATENÇÃO: API keys são criptografadas via AES-256-GCM (THREAT-005).
 * O campo encryptedKey NUNCA deve aparecer nas respostas.
 *
 * Pré-requisito: seed de teste executado (bun run seed:test)
 */

jest.mock('@/lib/auth')

import { GET as listCredentials } from '@/app/api/v1/admin/config/credentials/route'
import { PUT as upsertCredential, DELETE as deleteCredential } from '@/app/api/v1/admin/config/credentials/[provider]/route'
import { GET as listScoringRules } from '@/app/api/v1/admin/config/scoring-rules/route'
import { PATCH as updateScoringRule } from '@/app/api/v1/admin/config/scoring-rules/[id]/route'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { makeRequest, makeRouteContext, parseResponseJson } from './helpers/request.helper'
import { setupAdminMock, setupUnauthenticatedMock } from './helpers/auth.helper'
import {
  buildUpsertCredentialPayload,
  buildUpdateScoringRulePayload,
} from './helpers/factory.helper'
import { trackCreatedCredential, cleanupTracked } from './helpers/db.helper'
import { prisma } from '@/lib/prisma'

// Provedor único para testes (evitar conflito com seed existente)
const TEST_PROVIDER = 'TEST_PROVIDER_INTEGRATION'

afterEach(async () => {
  await cleanupTracked()
  jest.clearAllMocks()
})

// ─── GET /api/v1/admin/config/credentials ────────────────────────────────────

describe('GET /api/v1/admin/config/credentials', () => {
  beforeEach(() => {
    setupAdminMock(requireAdmin as jest.Mock, 'ADMIN')
  })

  it('[CENÁRIO 1] deve listar credenciais SEM expor encryptedKey (THREAT-005)', async () => {
    const res = await listCredentials()
    const body = await parseResponseJson<{ data: Array<Record<string, unknown>> }>(res)

    expect(res.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)

    // Verificar que encryptedKey NUNCA está exposto
    body.data.forEach((cred) => {
      expect(cred).not.toHaveProperty('encryptedKey')
      expect(cred).not.toHaveProperty('apiKey')
      expect(cred).toHaveProperty('provider')
      expect(cred).toHaveProperty('isActive')
    })
  })

  it('[CENÁRIO 3] deve retornar 403 para OPERATOR acessando credenciais (AUTH_004)', async () => {
    setupAdminMock(requireAdmin as jest.Mock, 'OPERATOR')

    const res = await listCredentials()

    expect(res.status).toBe(403)
  })

  it('[CENÁRIO 3] deve retornar 401 sem autenticação', async () => {
    setupUnauthenticatedMock(requireAdmin as jest.Mock)

    const res = await listCredentials()

    expect(res.status).toBe(401)
  })
})

// ─── PUT /api/v1/admin/config/credentials/[provider] ─────────────────────────

describe('PUT /api/v1/admin/config/credentials/[provider]', () => {
  beforeEach(() => {
    setupAdminMock(requireAdmin as jest.Mock, 'ADMIN')
  })

  it('[CENÁRIO 1] deve criar/atualizar credencial com API key criptografada', async () => {
    const payload = buildUpsertCredentialPayload({ apiKey: 'sk-test-integration-key-12345' })
    const req = makeRequest('PUT', `/api/v1/admin/config/credentials/${TEST_PROVIDER}`, { body: payload })
    const ctx = makeRouteContext({ provider: TEST_PROVIDER })
    const res = await upsertCredential(req, ctx)
    const body = await parseResponseJson<{
      data: { provider: string; isActive: boolean }
    }>(res)

    expect([200, 201]).toContain(res.status)
    expect(body.data.provider).toBe(TEST_PROVIDER)
    expect(body.data.isActive).toBe(true)

    // Registrar para limpeza
    trackCreatedCredential(TEST_PROVIDER)

    // Verificar no banco que a chave está criptografada (não em texto puro)
    const dbCred = await prisma.apiCredential.findUnique({
      where: { provider: TEST_PROVIDER },
    })
    expect(dbCred).not.toBeNull()
    // A chave armazenada NÃO deve ser a chave original em texto puro
    expect(dbCred?.encryptedKey).not.toBe('sk-test-integration-key-12345')
    // Deve ter um formato de chave criptografada
    expect(dbCred?.encryptedKey).toBeDefined()
  })

  it('[CENÁRIO 2] deve retornar 422 com apiKey vazia (VAL_001)', async () => {
    const req = makeRequest('PUT', `/api/v1/admin/config/credentials/${TEST_PROVIDER}`, {
      body: { apiKey: '' },
    })
    const ctx = makeRouteContext({ provider: TEST_PROVIDER })
    const res = await upsertCredential(req, ctx)

    expect(res.status).toBe(422)
  })

  it('[CENÁRIO 3] deve retornar 403 para OPERATOR tentando gerenciar credenciais (AUTH_004)', async () => {
    setupAdminMock(requireAdmin as jest.Mock, 'OPERATOR')

    const req = makeRequest('PUT', `/api/v1/admin/config/credentials/GOOGLE_PLACES`, {
      body: buildUpsertCredentialPayload(),
    })
    const ctx = makeRouteContext({ provider: 'GOOGLE_PLACES' })
    const res = await upsertCredential(req, ctx)

    expect(res.status).toBe(403)
  })
})

// ─── GET /api/v1/admin/config/scoring-rules ──────────────────────────────────

describe('GET /api/v1/admin/config/scoring-rules', () => {
  beforeEach(() => {
    setupAdminMock(requireAdmin as jest.Mock, 'ADMIN')
  })

  it('[CENÁRIO 1] deve listar scoring rules seedadas', async () => {
    const res = await listScoringRules()
    const body = await parseResponseJson<{
      data: Array<{ id: string; name: string; weight: number; isActive: boolean }>
    }>(res)

    expect(res.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeGreaterThanOrEqual(6) // seed tem 6 scoring rules

    // Verificar estrutura de cada regra
    body.data.forEach((rule) => {
      expect(rule).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        weight: expect.any(Number),
        isActive: expect.any(Boolean),
      })
      expect(rule.weight).toBeGreaterThanOrEqual(0)
      expect(rule.weight).toBeLessThanOrEqual(5)
    })
  })

  it('[CENÁRIO 3] deve retornar 403 para OPERATOR', async () => {
    setupAdminMock(requireAdmin as jest.Mock, 'OPERATOR')

    const res = await listScoringRules()

    expect(res.status).toBe(403)
  })
})

// ─── PUT /api/v1/admin/config/scoring-rules/[id] ─────────────────────────────

describe('PUT /api/v1/admin/config/scoring-rules/[id]', () => {
  let targetRuleId: string

  beforeAll(async () => {
    // Pegar o ID de uma scoring rule real do banco
    const rule = await prisma.scoringRule.findFirst({ where: { isActive: true } })
    if (!rule) throw new Error('Nenhuma scoring rule encontrada. Execute seed:test primeiro.')
    targetRuleId = rule.id
  })

  beforeEach(() => {
    setupAdminMock(requireAdmin as jest.Mock, 'ADMIN')
  })

  afterEach(async () => {
    // Restaurar peso original (3) após testes
    await prisma.scoringRule.update({
      where: { id: targetRuleId },
      data: { weight: 3, isActive: true },
    }).catch(() => null)
  })

  it('[CENÁRIO 1] deve atualizar peso de scoring rule e persistir no banco', async () => {
    const payload = buildUpdateScoringRulePayload({ weight: 5 })
    const req = makeRequest('PUT', `/api/v1/admin/config/scoring-rules/${targetRuleId}`, { body: payload })
    const ctx = makeRouteContext({ id: targetRuleId })
    const res = await updateScoringRule(req, ctx)

    expect(res.status).toBe(200)

    const dbRule = await prisma.scoringRule.findUnique({ where: { id: targetRuleId } })
    expect(dbRule?.weight).toBe(5)
  })

  it('[CENÁRIO 1] deve desativar scoring rule (isActive: false)', async () => {
    const payload = buildUpdateScoringRulePayload({ isActive: false })
    const req = makeRequest('PUT', `/api/v1/admin/config/scoring-rules/${targetRuleId}`, { body: payload })
    const ctx = makeRouteContext({ id: targetRuleId })
    const res = await updateScoringRule(req, ctx)

    expect(res.status).toBe(200)

    const dbRule = await prisma.scoringRule.findUnique({ where: { id: targetRuleId } })
    expect(dbRule?.isActive).toBe(false)
  })

  it('[CENÁRIO 2] deve retornar 422 com weight fora do range 0–5 (VAL_003)', async () => {
    const req = makeRequest('PUT', `/api/v1/admin/config/scoring-rules/${targetRuleId}`, {
      body: { weight: 10 }, // max é 5
    })
    const ctx = makeRouteContext({ id: targetRuleId })
    const res = await updateScoringRule(req, ctx)

    expect(res.status).toBe(422)

    // Peso não deve ter sido alterado
    const dbRule = await prisma.scoringRule.findUnique({ where: { id: targetRuleId } })
    expect(dbRule?.weight).not.toBe(10)
  })

  it('[CENÁRIO 2] deve retornar 404 para scoring rule inexistente', async () => {
    const fakeId = '00000000-0000-0000-ffff-000000000099'
    const req = makeRequest('PUT', `/api/v1/admin/config/scoring-rules/${fakeId}`, {
      body: { weight: 3 },
    })
    const ctx = makeRouteContext({ id: fakeId })
    const res = await updateScoringRule(req, ctx)

    expect(res.status).toBe(404)
  })

  it('[CENÁRIO 3] deve retornar 403 para OPERATOR tentando alterar scoring rules', async () => {
    setupAdminMock(requireAdmin as jest.Mock, 'OPERATOR')

    const req = makeRequest('PUT', `/api/v1/admin/config/scoring-rules/${targetRuleId}`, {
      body: { weight: 0 },
    })
    const ctx = makeRouteContext({ id: targetRuleId })
    const res = await updateScoringRule(req, ctx)

    expect(res.status).toBe(403)
  })
})
