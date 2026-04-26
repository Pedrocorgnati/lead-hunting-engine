jest.mock('@/lib/prisma', () => ({
  prisma: {
    lead: { deleteMany: jest.fn() },
    rawLeadData: { deleteMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}))

const mockCaptureException = jest.fn()
const mockCaptureMessage = jest.fn()
jest.mock('@/lib/observability/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}))

import { runRetentionCleanup } from '../retention-cleanup'
import { prisma } from '@/lib/prisma'

const leadDelete = prisma.lead.deleteMany as jest.MockedFunction<typeof prisma.lead.deleteMany>
const rawDelete = prisma.rawLeadData.deleteMany as jest.MockedFunction<typeof prisma.rawLeadData.deleteMany>
const auditCreate = prisma.auditLog.create as jest.MockedFunction<typeof prisma.auditLog.create>

beforeEach(() => {
  jest.clearAllMocks()
})

describe('runRetentionCleanup', () => {
  it('happy path: retorna counts e grava auditLog', async () => {
    leadDelete.mockResolvedValue({ count: 3 } as never)
    rawDelete.mockResolvedValue({ count: 7 } as never)
    auditCreate.mockResolvedValue({} as never)

    const res = await runRetentionCleanup()

    expect(res.deleted).toBe(3)
    expect(res.rawDeleted).toBe(7)
    expect(res.executedAt).toBeInstanceOf(Date)
    expect(typeof res.durationMs).toBe('number')
    expect(auditCreate).toHaveBeenCalledTimes(1)

    const auditCall = auditCreate.mock.calls[0][0] as {
      data: { action: string; resource: string; metadata: Record<string, unknown> }
    }
    expect(auditCall.data.action).toBe('RETENTION_CLEANUP')
    expect(auditCall.data.metadata.deleted).toBe(3)
    expect(auditCall.data.metadata.rawDeleted).toBe(7)
    expect(auditCall.data.metadata.durationMs).toEqual(expect.any(Number))
    expect(mockCaptureMessage).toHaveBeenCalled()
  })

  it('sem leads expirados: counts zero e audit log gravado', async () => {
    leadDelete.mockResolvedValue({ count: 0 } as never)
    rawDelete.mockResolvedValue({ count: 0 } as never)
    auditCreate.mockResolvedValue({} as never)

    const res = await runRetentionCleanup()

    expect(res.deleted).toBe(0)
    expect(res.rawDeleted).toBe(0)
    expect(auditCreate).toHaveBeenCalledTimes(1)
  })

  it('captura excecao no Sentry quando prisma falha', async () => {
    const boom = new Error('db offline')
    leadDelete.mockRejectedValue(boom)
    rawDelete.mockResolvedValue({ count: 0 } as never)

    await expect(runRetentionCleanup()).rejects.toThrow('db offline')
    expect(mockCaptureException).toHaveBeenCalledWith(boom, { job: 'retention-cleanup' })
    expect(auditCreate).not.toHaveBeenCalled()
  })
})
