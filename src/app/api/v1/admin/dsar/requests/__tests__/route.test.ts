const requireAdminMock = jest.fn()
class MockAuthError extends Error {}
jest.mock('@/lib/auth', () => ({
  AuthError: MockAuthError,
  handleAuthError: jest.fn(),
  requireAdmin: (...args: unknown[]) => requireAdminMock(...(args as never[])),
}))

const auditFindManyMock = jest.fn()
const auditFindFirstMock = jest.fn()
const auditCreateMock = jest.fn()
const userProfileUpdateMock = jest.fn()
const transactionMock = jest.fn(async (callback: (tx: unknown) => unknown) =>
  callback({
    auditLog: { create: auditCreateMock },
    userProfile: { update: userProfileUpdateMock },
  }),
)
const waitlistFindManyMock = jest.fn()
const contactFindManyMock = jest.fn()
const landingConsentFindManyMock = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (callback: unknown) => transactionMock(callback as never),
    auditLog: {
      findMany: (...args: unknown[]) => auditFindManyMock(...(args as never[])),
      findFirst: (...args: unknown[]) => auditFindFirstMock(...(args as never[])),
      create: (...args: unknown[]) => auditCreateMock(...(args as never[])),
    },
    userProfile: {
      update: (...args: unknown[]) => userProfileUpdateMock(...(args as never[])),
    },
    waitlistEntry: {
      findMany: (...args: unknown[]) => waitlistFindManyMock(...(args as never[])),
    },
    contactMessage: {
      findMany: (...args: unknown[]) => contactFindManyMock(...(args as never[])),
    },
    landingConsent: {
      findMany: (...args: unknown[]) => landingConsentFindManyMock(...(args as never[])),
    },
  },
}))

const signInWithPasswordMock = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...(args as never[])),
    },
  }),
}))

import { NextRequest } from 'next/server'
import { GET as listRequests } from '../route'
import { GET as getRequestDetail } from '../[id]/route'
import { GET as getAuditLog } from '../[id]/audit-log/route'
import { POST as attachEvidence } from '../[id]/attach-evidence/route'
import { POST as executeDeletion } from '../[id]/execute-deletion/route'
import { POST as executeExport } from '../[id]/execute-export/route'

function mkReq(path: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`))
}

function mkPost(path: string, body: Record<string, unknown>, headers?: HeadersInit): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  })
}

function audit(overrides: Record<string, unknown>) {
  return {
    id: 'audit-1',
    userId: 'user-1',
    action: 'profile.data_export_requested',
    resource: 'user_profiles',
    resourceId: 'user-1',
    metadata: {},
    ipAddress: '203.0.113.10',
    createdAt: new Date('2026-05-28T10:00:00Z'),
    user: {
      id: 'user-1',
      email: 'maria.silva@example.com',
      name: 'Maria Silva',
      termsAcceptedAt: new Date('2026-05-01T09:00:00Z'),
      deletionRequestedAt: null,
    },
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' })
  auditCreateMock.mockResolvedValue({ id: 'audit-created-1' })
  userProfileUpdateMock.mockResolvedValue({ id: 'user-1' })
  transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      auditLog: { create: auditCreateMock },
      userProfile: { update: userProfileUpdateMock },
    }),
  )
  signInWithPasswordMock.mockResolvedValue({ error: null })
  waitlistFindManyMock.mockResolvedValue([])
  contactFindManyMock.mockResolvedValue([])
  landingConsentFindManyMock.mockResolvedValue([])
})

describe('GET /api/v1/admin/dsar/requests', () => {
  it('lista solicitacoes DSAR com PII mascarada, timeline e paginacao', async () => {
    auditFindManyMock
      .mockResolvedValueOnce([
        audit({
          id: 'req-export-1',
          metadata: {
            status: 'COMPLETED',
            completed_at: '2026-05-28T10:01:00.000Z',
            correlationId: 'corr-1',
          },
        }),
      ])
      .mockResolvedValueOnce([])

    const res = await listRequests(mkReq('/api/v1/admin/dsar/requests?type=EXPORT'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.meta.total).toBe(1)
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        requestId: 'req-export-1',
        type: 'EXPORT',
        status: 'COMPLETED',
        correlationId: 'corr-1',
      }),
    )
    expect(body.data[0].subject.email).toBe('ma*********@e***.com')
    expect(body.data[0].subject.name).toBe('M**** S****')
    expect(body.data[0].timeline.map((event: { status: string }) => event.status)).toEqual([
      'REQUESTED',
      'EXPORT_READY',
      'COMPLETED',
    ])
    expect(body.data[0].links.detail).toBe('/api/v1/admin/dsar/requests/req-export-1')
  })

  it('filtra por status derivado e SLA sem vazar itens fora do filtro', async () => {
    auditFindManyMock
      .mockResolvedValueOnce([
        audit({
          id: 'req-del-1',
          action: 'user.deletion_requested',
          createdAt: new Date('2026-05-01T10:00:00Z'),
        }),
      ])
      .mockResolvedValueOnce([
        audit({
          id: 'event-del-1',
          action: 'user.deletion_completed',
          createdAt: new Date('2026-05-02T10:00:00Z'),
        }),
      ])

    const res = await listRequests(
      mkReq('/api/v1/admin/dsar/requests?status=COMPLETED&sla=OK&type=DELETION'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.meta.total).toBe(1)
    expect(body.data[0].type).toBe('DELETION')
    expect(body.data[0].status).toBe('COMPLETED')
    expect(body.data[0].timeline.map((event: { status: string }) => event.status)).toEqual([
      'REQUESTED',
      'COMPLETED',
    ])
  })
})

describe('GET /api/v1/admin/dsar/requests/:id', () => {
  it('retorna detalhe com comprovantes LGPD e historico de eventos', async () => {
    auditFindFirstMock.mockResolvedValue(
      audit({
        id: 'req-export-2',
        metadata: { correlationId: 'corr-2' },
      }),
    )
    auditFindManyMock.mockResolvedValue([
      audit({
        id: 'req-export-2',
        metadata: { correlationId: 'corr-2' },
      }),
      audit({
        id: 'event-export-2',
        action: 'profile.data_exported',
        metadata: { requestId: 'req-export-2', correlationId: 'corr-2' },
        createdAt: new Date('2026-05-28T11:00:00Z'),
      }),
      audit({
        id: 'event-evidence-2',
        userId: 'admin-1',
        action: 'admin.dsar.evidence_attached',
        resource: 'dsar_request',
        resourceId: 'req-export-2',
        metadata: {
          requestId: 'req-export-2',
          correlationId: 'corr-evidence',
          evidence: {
            id: 'evidence-1',
            type: 'CONSENT_RECEIPT',
            filename: 'consent-receipt.json',
            mimeType: 'application/json',
            sizeBytes: 512,
            hash: 'a'.repeat(64),
            url: 'https://example.com/receipt.json',
            note: 'Comprovante anexado.',
          },
        },
        createdAt: new Date('2026-05-28T11:05:00Z'),
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          name: 'Admin LGPD',
          termsAcceptedAt: null,
          deletionRequestedAt: null,
        },
      }),
    ])
    waitlistFindManyMock.mockResolvedValue([{ id: 'wait-1', consentId: 'consent-1' }])
    landingConsentFindManyMock.mockResolvedValue([
      {
        id: 'consent-1',
        version: 'v1',
        categories: ['necessary', 'analytics'],
        acceptedAt: new Date('2026-05-01T09:00:00Z'),
      },
    ])

    const res = await getRequestDetail(mkReq('/api/v1/admin/dsar/requests/req-export-2'), {
      params: Promise.resolve({ id: 'req-export-2' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.request.requestId).toBe('req-export-2')
    expect(body.data.request.evidence.consentReceipts[0]).toEqual(
      expect.objectContaining({
        receiptId: 'consent-1',
        policyVersion: 'v1',
        categories: ['necessary', 'analytics'],
        downloadUrl: '/api/v1/consent/receipt?receiptId=consent-1&format=download',
      }),
    )
    expect(body.data.request.evidence.attachments[0]).toEqual(
      expect.objectContaining({
        id: 'evidence-1',
        type: 'CONSENT_RECEIPT',
        filename: 'consent-receipt.json',
        hash: 'a'.repeat(64),
        auditEventId: 'event-evidence-2',
        author: expect.objectContaining({
          email: 'admin@example.com',
        }),
      }),
    )
    expect(body.data.request.evidence.auditEvents).toHaveLength(3)
    expect(body.data.request.evidence.termsAcceptedAt).toBe('2026-05-01T09:00:00.000Z')
  })

  it('retorna 404 quando a solicitacao nao existe', async () => {
    auditFindFirstMock.mockResolvedValue(null)

    const res = await getRequestDetail(mkReq('/api/v1/admin/dsar/requests/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error.code).toBe('DSAR_080')
  })
})

describe('POST /api/v1/admin/dsar/requests/:id/attach-evidence', () => {
  it('anexa evidencia operacional com auditEvent, autor, hash e correlationId', async () => {
    auditFindFirstMock.mockResolvedValue(
      audit({
        id: 'req-export-4',
        metadata: { correlationId: 'corr-original' },
      }),
    )
    auditFindManyMock.mockResolvedValue([])
    auditCreateMock.mockResolvedValue({
      id: 'audit-evidence-4',
      action: 'admin.dsar.evidence_attached',
      resource: 'dsar_request',
      resourceId: 'req-export-4',
      createdAt: new Date('2026-05-28T12:00:00Z'),
    })

    const res = await attachEvidence(
      mkPost('/api/v1/admin/dsar/requests/req-export-4/attach-evidence', {
        type: 'CONSENT_RECEIPT',
        filename: 'consent-receipt.json',
        mimeType: 'application/json',
        sizeBytes: 512,
        hash: 'b'.repeat(64),
        url: 'https://example.com/consent-receipt.json',
        note: 'Comprovante baixado e anexado pelo admin.',
        correlationId: 'corr-evidence-4',
      }),
      { params: Promise.resolve({ id: 'req-export-4' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.data.evidence).toEqual(
      expect.objectContaining({
        type: 'CONSENT_RECEIPT',
        filename: 'consent-receipt.json',
        hash: 'b'.repeat(64),
        auditEventId: 'audit-evidence-4',
        author: expect.objectContaining({ email: 'admin@example.com' }),
      }),
    )
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin.dsar.evidence_attached',
          resource: 'dsar_request',
          resourceId: 'req-export-4',
          metadata: expect.objectContaining({
            requestId: 'req-export-4',
            previousStatus: 'REQUESTED',
            nextStatus: 'REQUESTED',
            correlationId: 'corr-evidence-4',
            evidence: expect.objectContaining({
              type: 'CONSENT_RECEIPT',
              hash: 'b'.repeat(64),
            }),
          }),
        }),
      }),
    )
  })
})

describe('GET /api/v1/admin/dsar/requests/:id/audit-log', () => {
  it('retorna anexos e audit log completo do ciclo DSAR', async () => {
    auditFindFirstMock.mockResolvedValue(
      audit({
        id: 'req-del-4',
        action: 'user.deletion_requested',
      }),
    )
    auditFindManyMock.mockResolvedValue([
      audit({
        id: 'event-del-4',
        action: 'admin.dsar.deletion_executed',
        resource: 'dsar_request',
        resourceId: 'req-del-4',
        metadata: {
          requestId: 'req-del-4',
          previousStatus: 'REQUESTED',
          nextStatus: 'DELETION_EXECUTED',
          correlationId: 'corr-del-4',
        },
        createdAt: new Date('2026-05-28T12:10:00Z'),
      }),
      audit({
        id: 'event-evidence-4',
        userId: 'admin-1',
        action: 'admin.dsar.evidence_attached',
        resource: 'dsar_request',
        resourceId: 'req-del-4',
        metadata: {
          requestId: 'req-del-4',
          correlationId: 'corr-evidence-del-4',
          evidence: {
            id: 'evidence-del-4',
            type: 'DELETION_PROOF',
            filename: 'deletion-proof.json',
            mimeType: 'application/json',
            sizeBytes: 256,
            hash: 'c'.repeat(64),
            note: 'Evidencia da execucao de exclusao.',
          },
        },
        createdAt: new Date('2026-05-28T12:15:00Z'),
        user: {
          id: 'admin-1',
          email: 'admin@example.com',
          name: 'Admin LGPD',
          termsAcceptedAt: null,
          deletionRequestedAt: null,
        },
      }),
      audit({
        id: 'event-complete-4',
        action: 'admin.dsar.completed',
        resource: 'dsar_request',
        resourceId: 'req-del-4',
        metadata: {
          requestId: 'req-del-4',
          previousStatus: 'DELETION_EXECUTED',
          nextStatus: 'COMPLETED',
          correlationId: 'corr-complete-4',
        },
        createdAt: new Date('2026-05-28T12:20:00Z'),
      }),
    ])

    const res = await getAuditLog(mkReq('/api/v1/admin/dsar/requests/req-del-4/audit-log'), {
      params: Promise.resolve({ id: 'req-del-4' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.status).toBe('COMPLETED')
    expect(body.data.attachments[0]).toEqual(
      expect.objectContaining({
        id: 'evidence-del-4',
        type: 'DELETION_PROOF',
        filename: 'deletion-proof.json',
        hash: 'c'.repeat(64),
      }),
    )
    expect(body.data.auditLog.map((event: { action: string }) => event.action)).toEqual([
      'user.deletion_requested',
      'admin.dsar.deletion_executed',
      'admin.dsar.evidence_attached',
      'admin.dsar.completed',
    ])
  })
})

describe('POST /api/v1/admin/dsar/requests/:id/execute-*', () => {
  it('executa exportacao REQUESTED -> EXPORT_READY com auditEvent e correlationId', async () => {
    auditFindFirstMock.mockResolvedValue(
      audit({
        id: 'req-export-3',
        metadata: { correlationId: 'corr-original' },
      }),
    )
    auditFindManyMock.mockResolvedValue([])

    const res = await executeExport(
      mkPost('/api/v1/admin/dsar/requests/req-export-3/execute-export', {
        correlationId: 'corr-export',
      }),
      { params: Promise.resolve({ id: 'req-export-3' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.status).toBe('EXPORT_READY')
    expect(body.data.correlationId).toBe('corr-export')
    expect(auditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin.dsar.export_ready',
          resource: 'dsar_request',
          resourceId: 'req-export-3',
          metadata: expect.objectContaining({
            requestId: 'req-export-3',
            previousStatus: 'REQUESTED',
            nextStatus: 'EXPORT_READY',
            correlationId: 'corr-export',
          }),
        }),
      }),
    )
  })

  it('bloqueia exclusao sem reauth e confirmation challenge', async () => {
    auditFindFirstMock.mockResolvedValue(
      audit({
        id: 'req-del-2',
        action: 'user.deletion_requested',
      }),
    )
    auditFindManyMock.mockResolvedValue([])

    const res = await executeDeletion(
      mkPost('/api/v1/admin/dsar/requests/req-del-2/execute-deletion', {
        correlationId: 'corr-del',
      }),
      { params: Promise.resolve({ id: 'req-del-2' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error).toEqual(
      expect.objectContaining({
        code: 'AUTH_006',
        correlationId: 'corr-del',
      }),
    )
    expect(auditCreateMock).not.toHaveBeenCalled()
    expect(userProfileUpdateMock).not.toHaveBeenCalled()
  })

  it('nao avanca exclusao quando auditEvent falha dentro da transacao', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    auditCreateMock.mockRejectedValueOnce(new Error('audit failed'))
    auditFindFirstMock.mockResolvedValue(
      audit({
        id: 'req-del-3',
        action: 'user.deletion_requested',
      }),
    )
    auditFindManyMock.mockResolvedValue([])

    const res = await executeDeletion(
      mkPost(
        '/api/v1/admin/dsar/requests/req-del-3/execute-deletion',
        {
          correlationId: 'corr-del-fail',
          confirmationChallenge: 'DELETE req-del-3',
          currentPassword: 'SenhaSegura123',
        },
        { 'x-confirm': 'true' },
      ),
      { params: Promise.resolve({ id: 'req-del-3' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toEqual(
      expect.objectContaining({
        code: 'SYS_001',
        correlationId: 'corr-del-fail',
      }),
    )
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'SenhaSegura123',
    })
    expect(userProfileUpdateMock).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
