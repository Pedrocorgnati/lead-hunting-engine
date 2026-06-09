const requireAdminMock = jest.fn()
class MockAuthError extends Error {}
jest.mock('@/lib/auth', () => ({
  AuthError: MockAuthError,
  handleAuthError: jest.fn(),
  requireAdmin: (...args: unknown[]) => requireAdminMock(...(args as never[])),
}))

const countMock = jest.fn()
const findManyMock = jest.fn()
const groupByMock = jest.fn()
const findFirstMock = jest.fn()
const collectionFindManyMock = jest.fn()
const collectionFindUniqueMock = jest.fn()
const collectionCreateMock = jest.fn()
const collectionUpdateMock = jest.fn()
const auditCreateMock = jest.fn()
const auditFindManyMock = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    localQueueJob: {
      count: (...args: unknown[]) => countMock(...(args as never[])),
      findMany: (...args: unknown[]) => findManyMock(...(args as never[])),
      groupBy: (...args: unknown[]) => groupByMock(...(args as never[])),
      findFirst: (...args: unknown[]) => findFirstMock(...(args as never[])),
    },
    collectionJob: {
      findMany: (...args: unknown[]) => collectionFindManyMock(...(args as never[])),
      findUnique: (...args: unknown[]) => collectionFindUniqueMock(...(args as never[])),
      create: (...args: unknown[]) => collectionCreateMock(...(args as never[])),
      update: (...args: unknown[]) => collectionUpdateMock(...(args as never[])),
    },
    auditLog: {
      create: (...args: unknown[]) => auditCreateMock(...(args as never[])),
      findMany: (...args: unknown[]) => auditFindManyMock(...(args as never[])),
    },
  },
}))

const triggerMock = jest.fn()
jest.mock('@trigger.dev/sdk/v3', () => ({
  tasks: {
    trigger: (...args: unknown[]) => triggerMock(...(args as never[])),
  },
}))

import { NextRequest } from 'next/server'
import { GET as listJobs } from '../route'
import { GET as getJobDetail } from '../[id]/route'
import { GET as getJobAttempts } from '../[id]/attempts/route'
import { GET as getJobLogs } from '../[id]/logs/route'
import { POST as cancelJob } from '../[id]/cancel/route'
import { POST as escalateJob } from '../[id]/escalate/route'
import { POST as retryJob } from '../[id]/retry/route'
import { GET as getQueueStats } from '../queue/stats/route'
import { POST as bulkRetry } from '../bulk-retry/route'
import { POST as bulkCancel } from '../bulk-cancel/route'
import { POST as pauseQueue } from '../queue/pause/route'
import { POST as resumeQueue } from '../queue/resume/route'

function mkReq(path: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`))
}

function mkPost(path: string, body: unknown): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'user-agent': 'jest' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' })
})

describe('GET /api/v1/admin/jobs', () => {
  it('lista fila geral com filtros, paginacao e rastreio por correlationId', async () => {
    countMock.mockResolvedValueOnce(1)
    findManyMock.mockResolvedValueOnce([
      {
        id: 'job-1',
        kind: 'export',
        payload: { correlationId: 'corr-queue-1', priority: 'high' },
        status: 'PENDING',
        attempts: 1,
        leasedUntil: null,
        lastError: null,
        createdAt: new Date('2026-05-30T10:00:00Z'),
        runAt: new Date('2026-05-30T10:05:00Z'),
      },
    ])

    const res = await listJobs(
      mkReq('/api/v1/admin/jobs?status=PENDING&priority=high&correlationId=corr-queue-1&page=2&limit=10'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.meta).toEqual({ page: 2, limit: 10, total: 1, hasNext: false, hasPrev: true })
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        id: 'job-1',
        status: 'PENDING',
        priority: 'high',
        correlationId: 'corr-queue-1',
        lastUpdatedAt: '2026-05-30T10:05:00.000Z',
      }),
    )
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: {
          AND: [
            { status: 'PENDING' },
            { payload: { path: ['priority'], equals: 'high' } },
            { payload: { path: ['correlationId'], equals: 'corr-queue-1' } },
          ],
        },
      }),
    )
  })
})

describe('GET /api/v1/admin/jobs/:id', () => {
  it('retorna detalhe do job com timeline, causa raiz, provider, alerta e correlationId', async () => {
    collectionFindUniqueMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Padarias SP',
      status: 'FAILED',
      sources: ['GOOGLE_MAPS'],
      processedLeads: 10,
      resultCount: 8,
      progress: 80,
      triggerId: 'trg-1',
      errorMessage: 'Falha para pedro@example.com no telefone +55 11 99999-1234',
      errorLog: { rootCause: 'Provider timeout', code: 'PROVIDER_TIMEOUT' },
      currentSource: 'GOOGLE_MAPS',
      startedAt: new Date('2026-05-30T10:01:00Z'),
      completedAt: new Date('2026-05-30T10:03:00Z'),
      retriedFromId: null,
      metadata: { correlationId: 'corr-detail-1', priority: 'high', alertId: 'alert-1' },
      createdAt: new Date('2026-05-30T10:00:00Z'),
      updatedAt: new Date('2026-05-30T10:04:00Z'),
    })

    const res = await getJobDetail(
      mkReq('/api/v1/admin/jobs/00000000-0000-4000-8000-000000000001'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual(
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000001',
        type: 'Padarias SP',
        status: 'FAILED',
        provider: 'GOOGLE_MAPS',
        collectionId: '00000000-0000-4000-8000-000000000001',
        alertId: 'alert-1',
        correlationId: 'corr-detail-1',
        rootCause: 'Provider timeout',
      }),
    )
    expect(body.data.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'created', correlationId: 'corr-detail-1' }),
        expect.objectContaining({ type: 'error', message: expect.not.stringContaining('pedro@example.com') }),
      ]),
    )
  })

  it('retorna 404 para job inexistente sem vazar stack trace', async () => {
    collectionFindUniqueMock.mockResolvedValueOnce(null)

    const res = await getJobDetail(
      mkReq('/api/v1/admin/jobs/00000000-0000-4000-8000-000000000999'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000999' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error.code).toBe('JOB_080')
    expect(JSON.stringify(body)).not.toContain('stack')
  })
})

describe('GET /api/v1/admin/jobs/:id/attempts', () => {
  it('retorna attempts ordenados e rastreaveis por correlationId', async () => {
    collectionFindUniqueMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Padarias SP',
      status: 'FAILED',
      sources: ['GOOGLE_MAPS'],
      processedLeads: 10,
      resultCount: 8,
      progress: 80,
      triggerId: 'trg-1',
      errorMessage: 'Erro final',
      errorLog: {
        attempts: [
          {
            id: 'attempt-1',
            attemptNumber: 1,
            status: 'FAILED',
            provider: 'GOOGLE_MAPS',
            startedAt: '2026-05-30T10:01:00Z',
            finishedAt: '2026-05-30T10:02:00Z',
            errorCode: 'TIMEOUT',
            errorMessage: 'Token abc123 falhou para ana@example.com',
            correlationId: 'corr-attempt-1',
          },
        ],
      },
      currentSource: 'GOOGLE_MAPS',
      startedAt: new Date('2026-05-30T10:01:00Z'),
      completedAt: new Date('2026-05-30T10:03:00Z'),
      retriedFromId: null,
      metadata: { correlationId: 'corr-attempt-1' },
      createdAt: new Date('2026-05-30T10:00:00Z'),
      updatedAt: new Date('2026-05-30T10:04:00Z'),
    })

    const res = await getJobAttempts(
      mkReq('/api/v1/admin/jobs/00000000-0000-4000-8000-000000000001/attempts'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual(
      expect.objectContaining({
        jobId: '00000000-0000-4000-8000-000000000001',
        total: 1,
        correlationId: 'corr-attempt-1',
      }),
    )
    expect(body.data.attempts[0]).toEqual(
      expect.objectContaining({
        id: 'attempt-1',
        attemptNumber: 1,
        provider: 'GOOGLE_MAPS',
        durationMs: 60000,
        correlationId: 'corr-attempt-1',
      }),
    )
    expect(body.data.attempts[0].errorMessage).not.toContain('ana@example.com')
  })

  it('retorna total 0 e lista vazia quando job nao tem attempts (errorLog: null)', async () => {
    collectionFindUniqueMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Sem attempts',
      status: 'PENDING',
      sources: [],
      processedLeads: 0,
      resultCount: 0,
      progress: 0,
      triggerId: null,
      errorMessage: null,
      errorLog: null,
      currentSource: null,
      startedAt: null,
      completedAt: null,
      retriedFromId: null,
      metadata: null,
      createdAt: new Date('2026-05-30T10:00:00Z'),
      updatedAt: new Date('2026-05-30T10:00:00Z'),
    })

    const res = await getJobAttempts(
      mkReq('/api/v1/admin/jobs/00000000-0000-4000-8000-000000000002/attempts'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000002' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.attempts).toEqual([])
    expect(body.data.total).toBe(0)
  })

  it('retorna 401/403 quando usuario nao e admin', async () => {
    const { AuthError, handleAuthError } = await import('@/lib/auth') as unknown as {
      AuthError: { new(msg: string): Error }
      handleAuthError: jest.MockedFunction<(e: unknown) => Response>
    }
    const authErr = new AuthError('acesso negado')
    requireAdminMock.mockRejectedValueOnce(authErr)
    ;(handleAuthError as jest.MockedFunction<typeof handleAuthError>).mockReturnValueOnce(
      new Response(JSON.stringify({ error: { code: 'AUTH_003', message: 'Forbidden' } }), { status: 403 }),
    )

    const res = await getJobAttempts(
      mkReq('/api/v1/admin/jobs/00000000-0000-4000-8000-000000000001/attempts'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
    )

    expect(res.status).toBe(403)
    expect(collectionFindUniqueMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/admin/jobs/:id/logs', () => {
  it('retorna logs com PII mascarada e piiMasked true', async () => {
    collectionFindUniqueMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Padarias SP',
      status: 'FAILED',
      sources: ['GOOGLE_MAPS'],
      processedLeads: 10,
      resultCount: 8,
      progress: 80,
      triggerId: 'trg-1',
      errorMessage: 'Falha final',
      errorLog: [
        {
          at: '2026-05-30T10:03:00Z',
          level: 'error',
          message: 'Erro com maria@example.com CPF 123.456.789-09',
          token: 'secret-token',
        },
      ],
      currentSource: 'GOOGLE_MAPS',
      startedAt: new Date('2026-05-30T10:01:00Z'),
      completedAt: new Date('2026-05-30T10:03:00Z'),
      retriedFromId: null,
      metadata: { correlationId: 'corr-log-1', alertId: 'alert-1' },
      createdAt: new Date('2026-05-30T10:00:00Z'),
      updatedAt: new Date('2026-05-30T10:04:00Z'),
    })
    auditFindManyMock.mockResolvedValueOnce([
      {
        id: 'audit-1',
        action: 'admin.job.bulk_retry',
        resource: 'collection_job',
        resourceId: '00000000-0000-4000-8000-000000000001',
        metadata: {
          correlationId: 'corr-log-1',
          email: 'maria@example.com',
          authorization: 'Bearer abc123',
          phone: '+55 11 99999-1234',
        },
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-05-30T10:05:00Z'),
      },
    ])

    const res = await getJobLogs(
      mkReq('/api/v1/admin/jobs/00000000-0000-4000-8000-000000000001/logs?limit=10'),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.piiMasked).toBe(true)
    expect(body.data.correlationId).toBe('corr-log-1')
    expect(auditFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { resource: 'collection_job', resourceId: '00000000-0000-4000-8000-000000000001' },
        take: 10,
      }),
    )
    expect(JSON.stringify(body.data.logs)).not.toContain('maria@example.com')
    expect(JSON.stringify(body.data.logs)).not.toContain('123.456.789-09')
    expect(JSON.stringify(body.data.logs)).not.toContain('secret-token')
    expect(JSON.stringify(body.data.logs)).toContain('[REDACTED]')
  })
})

describe('POST /api/v1/admin/jobs/bulk-retry', () => {
  it('retorna sucesso parcial, correlationId e audit log por retry criado', async () => {
    collectionFindManyMock.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000001',
        userId: '00000000-0000-4000-8000-000000000002',
        name: 'Padarias SP',
        niche: 'Padarias',
        city: 'Sao Paulo',
        state: 'SP',
        country: 'BR',
        sources: ['GOOGLE_MAPS'],
        limitVal: 50,
        status: 'FAILED',
      },
      {
        id: '00000000-0000-4000-8000-000000000003',
        userId: '00000000-0000-4000-8000-000000000002',
        name: 'Clinicas RJ',
        niche: 'Clinicas',
        city: 'Rio de Janeiro',
        state: 'RJ',
        country: 'BR',
        sources: ['GOOGLE_MAPS'],
        limitVal: 25,
        status: 'RUNNING',
      },
    ])
    collectionCreateMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000004',
      status: 'PENDING',
    })
    auditCreateMock.mockResolvedValueOnce({ id: 'audit-1' })
    triggerMock.mockResolvedValueOnce({ id: 'trigger-1' })

    const res = await bulkRetry(
      mkPost('/api/v1/admin/jobs/bulk-retry', {
        jobIds: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000003',
          '00000000-0000-4000-8000-000000000005',
        ],
        reason: 'Reprocessamento apos falha transiente do provedor.',
        correlationId: 'corr-bulk-1',
        confirmationChallenge: 'REEXECUTAR JOBS',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.correlationId).toBe('corr-bulk-1')
    expect(body.data.summary).toEqual({
      requested: 3,
      succeeded: 1,
      failed: 2,
      affected: 1,
      errors: [
        {
          jobId: '00000000-0000-4000-8000-000000000003',
          code: 'INVALID_STATUS',
          message: 'Status RUNNING nao permite retry.',
        },
        {
          jobId: '00000000-0000-4000-8000-000000000005',
          code: 'JOB_NOT_FOUND',
          message: 'Job nao encontrado.',
        },
      ],
    })
    expect(collectionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          retriedFromId: '00000000-0000-4000-8000-000000000001',
        }),
      }),
    )
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin.job.bulk_retry',
          resourceId: '00000000-0000-4000-8000-000000000004',
          metadata: expect.objectContaining({ correlationId: 'corr-bulk-1' }),
        }),
      }),
    )
  })

  it('exige confirmationChallenge para retry em massa', async () => {
    const res = await bulkRetry(
      mkPost('/api/v1/admin/jobs/bulk-retry', {
        jobIds: ['00000000-0000-4000-8000-000000000001'],
        reason: 'Reprocessamento solicitado pelo suporte.',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('CONFIRMATION_REQUIRED')
    expect(collectionFindManyMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/admin/jobs/bulk-cancel', () => {
  it('cancela jobs elegiveis e preserva erros por item', async () => {
    collectionFindManyMock.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000001',
        userId: '00000000-0000-4000-8000-000000000002',
        name: 'Padarias SP',
        niche: 'Padarias',
        city: 'Sao Paulo',
        state: 'SP',
        country: 'BR',
        sources: ['GOOGLE_MAPS'],
        limitVal: 50,
        status: 'RUNNING',
      },
      {
        id: '00000000-0000-4000-8000-000000000003',
        userId: '00000000-0000-4000-8000-000000000002',
        name: 'Clinicas RJ',
        niche: 'Clinicas',
        city: 'Rio de Janeiro',
        state: 'RJ',
        country: 'BR',
        sources: ['GOOGLE_MAPS'],
        limitVal: 25,
        status: 'COMPLETED',
      },
    ])
    collectionUpdateMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      status: 'CANCELLED',
    })
    auditCreateMock.mockResolvedValueOnce({ id: 'audit-1' })

    const res = await bulkCancel(
      mkPost('/api/v1/admin/jobs/bulk-cancel', {
        jobIds: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000003',
        ],
        reason: 'Cancelamento solicitado pelo suporte.',
        correlationId: 'corr-cancel-1',
        confirmationChallenge: 'CANCELAR JOBS',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.summary).toEqual(
      expect.objectContaining({ requested: 2, succeeded: 1, failed: 1, affected: 1 }),
    )
    expect(collectionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELLED',
          errorMessage: 'Cancelamento solicitado pelo suporte.',
        }),
      }),
    )
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin.job.bulk_cancel',
          metadata: expect.objectContaining({ previousStatus: 'RUNNING', nextStatus: 'CANCELLED' }),
        }),
      }),
    )
  })
})

describe('POST /api/v1/admin/jobs/queue/pause e /queue/resume', () => {
  it('pausa jobs pendentes ou em execucao', async () => {
    collectionFindManyMock.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000001',
        userId: '00000000-0000-4000-8000-000000000002',
        name: 'Padarias SP',
        niche: 'Padarias',
        city: 'Sao Paulo',
        state: 'SP',
        country: 'BR',
        sources: ['GOOGLE_MAPS'],
        limitVal: 50,
        status: 'PENDING',
      },
    ])
    collectionUpdateMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      status: 'PAUSED',
    })
    auditCreateMock.mockResolvedValueOnce({ id: 'audit-1' })

    const res = await pauseQueue(
      mkPost('/api/v1/admin/jobs/queue/pause', {
        jobIds: ['00000000-0000-4000-8000-000000000001'],
        reason: 'Pausa operacional para manutencao do provedor.',
        correlationId: 'corr-pause-1',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.results[0]).toEqual(
      expect.objectContaining({ jobId: '00000000-0000-4000-8000-000000000001', ok: true, status: 'PAUSED' }),
    )
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'admin.job.queue_pause' }),
      }),
    )
  })

  it('retoma jobs pausados como pendentes', async () => {
    collectionFindManyMock.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000001',
        userId: '00000000-0000-4000-8000-000000000002',
        name: 'Padarias SP',
        niche: 'Padarias',
        city: 'Sao Paulo',
        state: 'SP',
        country: 'BR',
        sources: ['GOOGLE_MAPS'],
        limitVal: 50,
        status: 'PAUSED',
      },
    ])
    collectionUpdateMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      status: 'PENDING',
    })
    auditCreateMock.mockResolvedValueOnce({ id: 'audit-1' })

    const res = await resumeQueue(
      mkPost('/api/v1/admin/jobs/queue/resume', {
        jobIds: ['00000000-0000-4000-8000-000000000001'],
        reason: 'Manutencao finalizada.',
        correlationId: 'corr-resume-1',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.results[0]).toEqual(
      expect.objectContaining({ jobId: '00000000-0000-4000-8000-000000000001', ok: true, status: 'PENDING' }),
    )
    expect(collectionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', completedAt: null, errorMessage: null }),
      }),
    )
  })
})

describe('POST /api/v1/admin/jobs/:id/retry', () => {
  it('cria retry individual com audit log, motivo e correlationId', async () => {
    collectionFindUniqueMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      name: 'Padarias SP',
      niche: 'Padarias',
      city: 'Sao Paulo',
      state: 'SP',
      country: 'BR',
      sources: ['GOOGLE_MAPS'],
      limitVal: 50,
      status: 'FAILED',
      metadata: { provider: 'GOOGLE_MAPS' },
    })
    collectionCreateMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000004',
      status: 'PENDING',
    })
    auditCreateMock.mockResolvedValueOnce({ id: 'audit-1' })
    triggerMock.mockResolvedValueOnce({ id: 'trigger-1' })

    const res = await retryJob(
      mkPost('/api/v1/admin/jobs/00000000-0000-4000-8000-000000000001/retry', {
        reason: 'Reprocessamento individual apos falha do provedor.',
        correlationId: 'corr-retry-1',
      }),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual(
      expect.objectContaining({
        action: 'retry',
        jobId: '00000000-0000-4000-8000-000000000001',
        newJobId: '00000000-0000-4000-8000-000000000004',
        correlationId: 'corr-retry-1',
        result: 'SUCCESS',
      }),
    )
    expect(collectionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          retriedFromId: '00000000-0000-4000-8000-000000000001',
          metadata: expect.objectContaining({
            correlationId: 'corr-retry-1',
            retryReason: 'Reprocessamento individual apos falha do provedor.',
          }),
        }),
      }),
    )
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin.job.retry',
          resourceId: '00000000-0000-4000-8000-000000000001',
          metadata: expect.objectContaining({
            reason: 'Reprocessamento individual apos falha do provedor.',
            result: 'SUCCESS',
            correlationId: 'corr-retry-1',
            newJobId: '00000000-0000-4000-8000-000000000004',
          }),
        }),
      }),
    )
    expect(triggerMock).toHaveBeenCalledWith(
      'collect-leads',
      expect.objectContaining({
        jobId: '00000000-0000-4000-8000-000000000004',
        retriedFromId: '00000000-0000-4000-8000-000000000001',
        correlationId: 'corr-retry-1',
      }),
    )
  })
})

describe('POST /api/v1/admin/jobs/:id/cancel', () => {
  it('rejeita estado invalido com erro acessivel e sem update parcial', async () => {
    collectionFindUniqueMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      status: 'COMPLETED',
    })
    auditCreateMock.mockResolvedValueOnce({ id: 'audit-1' })

    const res = await cancelJob(
      mkPost('/api/v1/admin/jobs/00000000-0000-4000-8000-000000000001/cancel', {
        reason: 'Cancelamento solicitado pelo suporte.',
        correlationId: 'corr-cancel-single-1',
      }),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toEqual({
      code: 'INVALID_STATUS',
      message: 'Status COMPLETED nao permite cancel.',
      correlationId: 'corr-cancel-single-1',
    })
    expect(collectionUpdateMock).not.toHaveBeenCalled()
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin.job.cancel',
          metadata: expect.objectContaining({
            result: 'INVALID_STATUS',
            correlationId: 'corr-cancel-single-1',
            previousStatus: 'COMPLETED',
          }),
        }),
      }),
    )
  })
})

describe('POST /api/v1/admin/jobs/:id/escalate', () => {
  it('registra escalonamento individual com audit log e correlationId', async () => {
    collectionFindUniqueMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      status: 'RUNNING',
      metadata: { provider: 'GOOGLE_MAPS' },
    })
    collectionUpdateMock.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      status: 'RUNNING',
    })
    auditCreateMock.mockResolvedValueOnce({ id: 'audit-1' })

    const res = await escalateJob(
      mkPost('/api/v1/admin/jobs/00000000-0000-4000-8000-000000000001/escalate', {
        reason: 'Job preso em execucao por mais de trinta minutos.',
        correlationId: 'corr-escalate-1',
        escalateTo: 'operacoes-n2',
      }),
      { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual(
      expect.objectContaining({
        action: 'escalate',
        jobId: '00000000-0000-4000-8000-000000000001',
        status: 'RUNNING',
        correlationId: 'corr-escalate-1',
        result: 'SUCCESS',
      }),
    )
    expect(collectionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            correlationId: 'corr-escalate-1',
            escalation: expect.objectContaining({
              reason: 'Job preso em execucao por mais de trinta minutos.',
              escalateTo: 'operacoes-n2',
              correlationId: 'corr-escalate-1',
            }),
          }),
        }),
      }),
    )
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin.job.escalate',
          metadata: expect.objectContaining({
            reason: 'Job preso em execucao por mais de trinta minutos.',
            result: 'SUCCESS',
            correlationId: 'corr-escalate-1',
            escalateTo: 'operacoes-n2',
          }),
        }),
      }),
    )
  })
})

describe('GET /api/v1/admin/jobs/queue/stats', () => {
  it('retorna stats da fila geral sem substituir o endpoint de DLQ', async () => {
    countMock.mockResolvedValueOnce(4)
    groupByMock.mockResolvedValueOnce([
      { status: 'PENDING', _count: { _all: 2 } },
      { status: 'LEASED', _count: { _all: 1 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ])
    findFirstMock
      .mockResolvedValueOnce({ runAt: new Date('2026-05-30T10:05:00Z') })
      .mockResolvedValueOnce({ createdAt: new Date('2026-05-30T09:55:00Z') })
      .mockResolvedValueOnce({ createdAt: new Date('2026-05-30T10:10:00Z') })

    const res = await getQueueStats(mkReq('/api/v1/admin/jobs/queue/stats?kind=export'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({
      filters: { kind: 'export' },
      total: 4,
      byStatus: { PENDING: 2, LEASED: 1, DONE: 0, FAILED: 1 },
      pending: 2,
      leased: 1,
      done: 0,
      failed: 1,
      nextRunAt: '2026-05-30T10:05:00.000Z',
      oldestPendingAt: '2026-05-30T09:55:00.000Z',
      lastUpdatedAt: '2026-05-30T10:10:00.000Z',
      dlqEndpoint: '/api/v1/admin/dlq',
    })
  })
})
