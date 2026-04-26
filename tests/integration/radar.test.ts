/**
 * Testes de integração — Radar orquestrador (INTAKE-REVIEW TASK-2)
 *
 * Modulo: GET /api/v1/radar/presets, POST /api/v1/radar/recollect
 * Cobre: CL-102 (radar dispara recoleta), CL-103 (identifica novos/atualizados).
 *
 * Pre-requisito: seed de teste executado (bun run seed:test)
 */

jest.mock('@/lib/auth')
jest.mock('@trigger.dev/sdk/v3', () => ({
  tasks: {
    trigger: jest.fn().mockResolvedValue({ id: 'mock-run-id' }),
  },
}))

import { GET as listPresets } from '@/app/api/v1/radar/presets/route'
import { POST as recollect } from '@/app/api/v1/radar/recollect/route'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CollectionJobStatus } from '@/lib/constants/enums'
import { makeRequest, parseResponseJson } from './helpers/request.helper'
import { setupAuthMock, TEST_USERS } from './helpers/auth.helper'
import { trackCreatedJob, cleanupTracked } from './helpers/db.helper'
import type { RadarPreset } from '@/lib/services/radar-service'

afterEach(async () => {
  await cleanupTracked()
  jest.clearAllMocks()
})

describe('GET /api/v1/radar/presets', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  it('retorna combinacoes regiao+nicho do operador', async () => {
    const req = makeRequest('GET', '/api/v1/radar/presets')
    const res = await listPresets()
    const body = await parseResponseJson<{ data: RadarPreset[]; meta: { total: number } }>(res)

    expect(res.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta.total).toBe(body.data.length)
  })
})

describe('POST /api/v1/radar/recollect', () => {
  beforeEach(() => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')
  })

  it('cria CollectionJob com metadata.origin=RADAR', async () => {
    const req = makeRequest('POST', '/api/v1/radar/recollect', {
      body: { city: 'São Paulo', state: 'SP', niche: 'restaurante-teste-radar' },
    })
    const res = await recollect(req)
    const body = await parseResponseJson<{ data: { jobId: string } }>(res)

    expect(res.status).toBe(201)
    expect(body.data.jobId).toMatch(/^[0-9a-f-]{36}$/i)
    trackCreatedJob(body.data.jobId)

    const job = await prisma.collectionJob.findUnique({
      where: { id: body.data.jobId },
      select: { userId: true, niche: true, city: true, state: true, status: true, metadata: true },
    })
    expect(job).not.toBeNull()
    expect(job!.userId).toBe(TEST_USERS.OPERATOR.id)
    expect(job!.niche).toBe('restaurante-teste-radar')
    expect(job!.city).toBe('São Paulo')
    expect(job!.state).toBe('SP')
    expect(job!.status).toBe(CollectionJobStatus.PENDING)
    expect(job!.metadata).toEqual(expect.objectContaining({ origin: 'RADAR' }))
  })

  it('rejeita payload invalido (city ausente) com 400', async () => {
    const req = makeRequest('POST', '/api/v1/radar/recollect', {
      body: { state: 'SP', niche: 'x' },
    })
    const res = await recollect(req)
    expect(res.status).toBe(400)
  })
})
