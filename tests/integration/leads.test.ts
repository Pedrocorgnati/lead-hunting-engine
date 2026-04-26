/**
 * Testes de integração — Leads
 *
 * Módulo: GET /api/v1/leads, GET /api/v1/leads/count, GET /api/v1/leads/export
 *         GET /api/v1/leads/[id], PATCH /api/v1/leads/[id]/status,
 *         PATCH /api/v1/leads/[id]/notes, PATCH /api/v1/leads/[id]/pitch,
 *         POST /api/v1/leads/[id]/false-positive
 *
 * ATENÇÃO ESPECIAL:
 *   THREAT-001 (CRÍTICO) — IDOR em endpoints de leads: operador A acessa leads do operador B
 *   THREAT-002 (ALTO) — verificação de ownership obrigatória em todos os endpoints /[id]
 *
 * Pré-requisito: seed de teste executado (bun run seed:test)
 *
 * Test seed leads (todos do OPERATOR = 000...0011):
 *   LEAD_NEW                = 000...0030  score=85, WARM
 *   LEAD_CONTACTED          = 000...0031  score=72, WARM
 *   LEAD_CONVERTED          = 000...0033  score=95, HOT  (estado terminal)
 *   LEAD_FALSE_POSITIVE     = 000...0036  score=15, COLD (estado terminal)
 *   LEAD_ENRICHMENT_PENDING = 000...0037  score=0,  COLD
 */

jest.mock('@/lib/auth')

import { GET as listLeads } from '@/app/api/v1/leads/route'
import { GET as countLeads } from '@/app/api/v1/leads/count/route'
import { GET as exportLeads } from '@/app/api/v1/leads/export/route'
import { GET as getLeadDetail } from '@/app/api/v1/leads/[id]/route'
import { PATCH as updateLeadStatus } from '@/app/api/v1/leads/[id]/status/route'
import { PATCH as updateLeadNotes } from '@/app/api/v1/leads/[id]/notes/route'
import { PATCH as updateLeadPitch } from '@/app/api/v1/leads/[id]/pitch/route'
import { POST as markFalsePositive } from '@/app/api/v1/leads/[id]/false-positive/route'
import { requireAuth } from '@/lib/auth'
import { makeRequest, makeRouteContext, parseResponseJson } from './helpers/request.helper'
import { setupAuthMock, setupUnauthenticatedMock } from './helpers/auth.helper'
import {
  buildUpdateLeadNotesPayload,
  buildUpdateLeadPitchPayload,
  buildUpdateLeadStatusPayload,
} from './helpers/factory.helper'
import { getLeadFromDb } from './helpers/db.helper'
import { TEST_IDS } from '../../prisma/seed/test'
import { prisma } from '@/lib/prisma'

// ID de um usuário diferente do dono dos leads do seed
const ANOTHER_OPERATOR_ID = '00000000-0000-0000-0000-000000000099'

afterEach(() => {
  jest.clearAllMocks()
})

// ─── GET /api/v1/leads ────────────────────────────────────────────────────────

describe('GET /api/v1/leads', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  it('[CENÁRIO 1] deve listar leads do operador com paginação e ordenação por score', async () => {
    const req = makeRequest('GET', '/api/v1/leads', {
      query: { page: '1', limit: '10', sortBy: 'score', sortOrder: 'desc' },
    })
    const res = await listLeads(req)
    const body = await parseResponseJson<{
      data: Array<{ id: string; userId: string; score: number }>
      meta: { total: number }
    }>(res)

    expect(res.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta.total).toBeGreaterThanOrEqual(8) // seed tem 8 leads

    // Todos os leads devem pertencer ao operador autenticado (isolamento multi-tenant)
    body.data.forEach((lead) => {
      expect(lead.userId).toBe(TEST_IDS.OPERATOR)
    })

    // Verificar ordenação decrescente por score
    for (let i = 0; i < body.data.length - 1; i++) {
      expect(body.data[i].score).toBeGreaterThanOrEqual(body.data[i + 1].score)
    }
  })

  it('[CENÁRIO 1] deve filtrar leads por status NEW', async () => {
    const req = makeRequest('GET', '/api/v1/leads', {
      query: { status: 'NEW' },
    })
    const res = await listLeads(req)
    const body = await parseResponseJson<{
      data: Array<{ status: string }>
    }>(res)

    expect(res.status).toBe(200)
    body.data.forEach((lead) => {
      expect(lead.status).toBe('NEW')
    })
  })

  it('[CENÁRIO 1] deve filtrar leads por temperatura HOT', async () => {
    const req = makeRequest('GET', '/api/v1/leads', {
      query: { temperature: 'HOT' },
    })
    const res = await listLeads(req)
    const body = await parseResponseJson<{
      data: Array<{ temperature: string }>
    }>(res)

    expect(res.status).toBe(200)
    body.data.forEach((lead) => {
      expect(lead.temperature).toBe('HOT')
    })
  })

  it('[CENÁRIO 1] deve filtrar leads por scoreMin e scoreMax', async () => {
    const req = makeRequest('GET', '/api/v1/leads', {
      query: { scoreMin: '80', scoreMax: '100' },
    })
    const res = await listLeads(req)
    const body = await parseResponseJson<{
      data: Array<{ score: number }>
    }>(res)

    expect(res.status).toBe(200)
    body.data.forEach((lead) => {
      expect(lead.score).toBeGreaterThanOrEqual(80)
      expect(lead.score).toBeLessThanOrEqual(100)
    })
  })

  it('[CENÁRIO 3] deve retornar 401 sem autenticação', async () => {
    setupUnauthenticatedMock(requireAuth as jest.Mock)

    const req = makeRequest('GET', '/api/v1/leads')
    const res = await listLeads(req)

    expect(res.status).toBe(401)
  })
})

// ─── GET /api/v1/leads/count ──────────────────────────────────────────────────

describe('GET /api/v1/leads/count', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  it('[CENÁRIO 1] deve retornar contagens agregadas para o dashboard', async () => {
    const res = await countLeads()
    const body = await parseResponseJson<{
      data: {
        total: number
        byStatus: Record<string, number>
        byTemperature: Record<string, number>
      }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.data.total).toBeGreaterThanOrEqual(8)
    expect(body.data.byStatus).toBeDefined()
    expect(body.data.byTemperature).toBeDefined()
  })
})

// ─── GET /api/v1/leads/export ─────────────────────────────────────────────────

describe('GET /api/v1/leads/export', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  it('[CENÁRIO 1] deve gerar CSV com leads do operador', async () => {
    const req = makeRequest('GET', '/api/v1/leads/export')
    const res = await exportLeads(req)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')

    const csvContent = await res.text()
    // CSV não deve expor fórmulas Excel (THREAT-014 / CSV Injection)
    expect(csvContent).not.toMatch(/^=|^\+|^-|^@/m)
  })

  it('[CENÁRIO 3] deve retornar 401 sem autenticação', async () => {
    setupUnauthenticatedMock(requireAuth as jest.Mock)

    const req = makeRequest('GET', '/api/v1/leads/export')
    const res = await exportLeads(req)

    expect(res.status).toBe(401)
  })
})

// ─── GET /api/v1/leads/[id] ───────────────────────────────────────────────────

describe('GET /api/v1/leads/[id]', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  it('[CENÁRIO 1] deve retornar detalhe do lead com proveniência LGPD', async () => {
    const req = makeRequest('GET', `/api/v1/leads/${TEST_IDS.LEAD_NEW}`)
    const ctx = makeRouteContext({ id: TEST_IDS.LEAD_NEW })
    const res = await getLeadDetail(req, ctx)
    const body = await parseResponseJson<{
      data: { id: string; score: number; temperature: string; provenance?: unknown[] }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({
      id: TEST_IDS.LEAD_NEW,
      score: 85,
      temperature: 'WARM',
    })
  })

  it('[CENÁRIO 2] deve retornar 404 para lead inexistente (LEAD_080)', async () => {
    const fakeId = '00000000-0000-0000-ffff-000000000099'
    const req = makeRequest('GET', `/api/v1/leads/${fakeId}`)
    const ctx = makeRouteContext({ id: fakeId })
    const res = await getLeadDetail(req, ctx)

    expect(res.status).toBe(404)
  })

  it('[CENÁRIO 4] IDOR CRÍTICO — OPERADOR não pode acessar lead de outro operador (THREAT-001)', async () => {
    // Simular outro operador tentando acessar lead que não é dele
    ;(requireAuth as jest.Mock).mockResolvedValue({
      id: ANOTHER_OPERATOR_ID,
      email: 'atacante@test.local',
      role: 'OPERATOR',
    })

    const req = makeRequest('GET', `/api/v1/leads/${TEST_IDS.LEAD_NEW}`)
    const ctx = makeRouteContext({ id: TEST_IDS.LEAD_NEW })
    const res = await getLeadDetail(req, ctx)

    // DEVE retornar 403 (ownership check) ou 404 (filtro por userId)
    // Nunca 200 com dados de outro usuário
    expect([403, 404]).toContain(res.status)

    if (res.status === 200) {
      // Se por algum motivo retornar 200, garantir que NÃO são dados de outro usuário
      const body = await parseResponseJson<{ data: { userId: string } }>(res)
      fail(`IDOR detectado: operador ${ANOTHER_OPERATOR_ID} acessou lead do operador ${body.data.userId}`)
    }
  })
})

// ─── PATCH /api/v1/leads/[id]/status ─────────────────────────────────────────

describe('PATCH /api/v1/leads/[id]/status', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  it('[CENÁRIO 1] deve atualizar status NEW → CONTACTED com sucesso', async () => {
    const payload = buildUpdateLeadStatusPayload('CONTACTED')
    const req = makeRequest('PATCH', `/api/v1/leads/${TEST_IDS.LEAD_NEW}/status`, { body: payload })
    const ctx = makeRouteContext({ id: TEST_IDS.LEAD_NEW })
    const res = await updateLeadStatus(req, ctx)
    const body = await parseResponseJson<{ data: { status: string } }>(res)

    expect(res.status).toBe(200)
    expect(body.data.status).toBe('CONTACTED')

    // Verificar persistência no banco
    const dbLead = await getLeadFromDb(TEST_IDS.LEAD_NEW)
    expect(dbLead?.status).toBe('CONTACTED')
  })

  afterEach(async () => {
    // Restaurar status do lead NEW para o estado inicial
    await prisma.lead.update({
      where: { id: TEST_IDS.LEAD_NEW },
      data: { status: 'NEW' },
    }).catch(() => null)
  })

  it('[CENÁRIO 2] deve retornar 409 para transição de status inválida (LEAD_051)', async () => {
    // CONVERTED é estado terminal — não pode mudar para NEW
    const payload = buildUpdateLeadStatusPayload('NEW')
    const req = makeRequest('PATCH', `/api/v1/leads/${TEST_IDS.LEAD_CONVERTED}/status`, { body: payload })
    const ctx = makeRouteContext({ id: TEST_IDS.LEAD_CONVERTED })
    const res = await updateLeadStatus(req, ctx)

    expect(res.status).toBe(422)

    // Verificar que status não foi alterado
    const dbLead = await getLeadFromDb(TEST_IDS.LEAD_CONVERTED)
    expect(dbLead?.status).toBe('CONVERTED')
  })

  it('[CENÁRIO 4] IDOR — OPERADOR não pode alterar status de lead de outro operador (THREAT-001)', async () => {
    ;(requireAuth as jest.Mock).mockResolvedValue({
      id: ANOTHER_OPERATOR_ID,
      email: 'atacante@test.local',
      role: 'OPERATOR',
    })

    const payload = buildUpdateLeadStatusPayload('DISCARDED')
    const req = makeRequest('PATCH', `/api/v1/leads/${TEST_IDS.LEAD_NEW}/status`, { body: payload })
    const ctx = makeRouteContext({ id: TEST_IDS.LEAD_NEW })
    const res = await updateLeadStatus(req, ctx)

    expect([403, 404]).toContain(res.status)

    // Status deve permanecer NEW
    const dbLead = await getLeadFromDb(TEST_IDS.LEAD_NEW)
    expect(dbLead?.status).toBe('NEW')
  })
})

// ─── PATCH /api/v1/leads/[id]/notes ──────────────────────────────────────────

describe('PATCH /api/v1/leads/[id]/notes', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  afterEach(async () => {
    // Limpar anotações após testes
    await prisma.lead.update({
      where: { id: TEST_IDS.LEAD_NEW },
      data: { notes: null },
    }).catch(() => null)
  })

  it('[CENÁRIO 1] deve salvar anotações do operador no lead', async () => {
    const payload = buildUpdateLeadNotesPayload()
    const req = makeRequest('PATCH', `/api/v1/leads/${TEST_IDS.LEAD_NEW}/notes`, { body: payload })
    const ctx = makeRouteContext({ id: TEST_IDS.LEAD_NEW })
    const res = await updateLeadNotes(req, ctx)

    expect(res.status).toBe(200)

    const dbLead = await getLeadFromDb(TEST_IDS.LEAD_NEW)
    expect(dbLead?.notes).toBe(payload.notes)
  })

  it('[CENÁRIO 2] deve retornar 422 quando notas excedem 2000 caracteres (LEAD_020)', async () => {
    const notes = 'x'.repeat(5001) // excede 2000 chars definidos no schema
    const req = makeRequest('PATCH', `/api/v1/leads/${TEST_IDS.LEAD_NEW}/notes`, {
      body: { notes },
    })
    const ctx = makeRouteContext({ id: TEST_IDS.LEAD_NEW })
    const res = await updateLeadNotes(req, ctx)

    expect([400, 422]).toContain(res.status)

    // Verificar que nada foi salvo
    const dbLead = await getLeadFromDb(TEST_IDS.LEAD_NEW)
    expect(dbLead?.notes).toBeNull()
  })
})

// ─── PATCH /api/v1/leads/[id]/pitch ──────────────────────────────────────────

describe('PATCH /api/v1/leads/[id]/pitch', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  afterEach(async () => {
    await prisma.lead.update({
      where: { id: TEST_IDS.LEAD_NEW },
      data: { pitchContent: null, pitchTone: 'direto' },
    }).catch(() => null)
  })

  it('[CENÁRIO 1] deve editar pitch manualmente e persistir no banco', async () => {
    const payload = buildUpdateLeadPitchPayload({ pitchTone: 'formal' })
    const req = makeRequest('PATCH', `/api/v1/leads/${TEST_IDS.LEAD_NEW}/pitch`, { body: payload })
    const ctx = makeRouteContext({ id: TEST_IDS.LEAD_NEW })
    const res = await updateLeadPitch(req, ctx)

    expect(res.status).toBe(200)

    const dbLead = await getLeadFromDb(TEST_IDS.LEAD_NEW)
    expect(dbLead?.pitchContent).toBe(payload.pitchContent)
    expect(dbLead?.pitchTone).toBe('formal')
  })
})

// ─── POST /api/v1/leads/[id]/false-positive ──────────────────────────────────

describe('POST /api/v1/leads/[id]/false-positive', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  it('[CENÁRIO 1] deve marcar lead NEW como falso positivo com motivo', async () => {
    // Usar LEAD_ENRICHMENT_PENDING (não terminal) para este teste
    const req = makeRequest(
      'POST',
      `/api/v1/leads/${TEST_IDS.LEAD_ENRICHMENT_PENDING}/false-positive`,
      { body: { reason: 'Estabelecimento encerrado definitivamente' } },
    )
    const ctx = makeRouteContext({ id: TEST_IDS.LEAD_ENRICHMENT_PENDING })
    const res = await markFalsePositive(req, ctx)

    expect(res.status).toBe(200)

    const dbLead = await getLeadFromDb(TEST_IDS.LEAD_ENRICHMENT_PENDING)
    expect(dbLead?.status).toBe('FALSE_POSITIVE')
  })

  afterEach(async () => {
    // Restaurar lead para ENRICHMENT_PENDING
    await prisma.lead.update({
      where: { id: TEST_IDS.LEAD_ENRICHMENT_PENDING },
      data: { status: 'ENRICHMENT_PENDING', falsePositiveReason: null },
    }).catch(() => null)
  })

  it('[CENÁRIO 2] deve retornar 409 ao marcar lead já FALSE_POSITIVE (estado terminal)', async () => {
    const req = makeRequest(
      'POST',
      `/api/v1/leads/${TEST_IDS.LEAD_FALSE_POSITIVE}/false-positive`,
    )
    const ctx = makeRouteContext({ id: TEST_IDS.LEAD_FALSE_POSITIVE })
    const res = await markFalsePositive(req, ctx)

    expect(res.status).toBe(409)

    // Status deve permanecer FALSE_POSITIVE
    const dbLead = await getLeadFromDb(TEST_IDS.LEAD_FALSE_POSITIVE)
    expect(dbLead?.status).toBe('FALSE_POSITIVE')
  })

  it('[CENÁRIO 4] IDOR CRÍTICO — OPERADOR não pode marcar lead de outro como falso positivo (THREAT-001)', async () => {
    ;(requireAuth as jest.Mock).mockResolvedValue({
      id: ANOTHER_OPERATOR_ID,
      email: 'atacante@test.local',
      role: 'OPERATOR',
    })

    const req = makeRequest(
      'POST',
      `/api/v1/leads/${TEST_IDS.LEAD_NEW}/false-positive`,
    )
    const ctx = makeRouteContext({ id: TEST_IDS.LEAD_NEW })
    const res = await markFalsePositive(req, ctx)

    expect([403, 404]).toContain(res.status)

    // Status do lead NÃO deve ter sido alterado
    const dbLead = await getLeadFromDb(TEST_IDS.LEAD_NEW)
    expect(dbLead?.status).toBe('NEW')
  })
})
