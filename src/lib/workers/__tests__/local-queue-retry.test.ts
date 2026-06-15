/**
 * outreach-engine (06-10, task 03): split tentativa tecnica vs falha de
 * negocio + poison queue + retencao.
 * Aceite: erro permanente nao re-tenta; attempts (lease) nao se mistura com
 * failureCount (negocio) na decisao de retry.
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    localQueueJob: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services/system-config', () => ({
  getQueueRetention: jest.fn(async () => ({ doneDays: 14, failedDays: 30 })),
}))

import { ackFailed, sweepQueueRetention, _resetQueueSweepThrottle } from '../local-queue'
import { prisma } from '@/lib/prisma'

const findUnique = prisma.localQueueJob.findUnique as jest.Mock
const update = prisma.localQueueJob.update as jest.Mock
const deleteMany = prisma.localQueueJob.deleteMany as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  update.mockResolvedValue({})
})

describe('ackFailed — retry de negocio', () => {
  it('1a falha de negocio re-agenda com backoff e persiste reasonCode', async () => {
    findUnique.mockResolvedValue({ attempts: 1, failureCount: 0 })
    const res = await ackFailed('job-1', 'provider 500', { reasonCode: 'provider' })
    expect(res.terminal).toBe(false)
    const data = update.mock.calls[0][0].data
    expect(data.status).toBe('PENDING')
    expect(data.failureCount).toBe(1)
    expect(data.reasonCode).toBe('provider')
    expect(data.runAt).toBeInstanceOf(Date)
  })

  it('3a falha de negocio e terminal (FAILED)', async () => {
    findUnique.mockResolvedValue({ attempts: 3, failureCount: 2 })
    const res = await ackFailed('job-1', 'provider 500', { reasonCode: 'provider' })
    expect(res.terminal).toBe(true)
    expect(update.mock.calls[0][0].data.status).toBe('FAILED')
    expect(update.mock.calls[0][0].data.failureCount).toBe(3)
  })

  it('attempts alto (crash-loop de lease) e terminal mesmo com failureCount baixo', async () => {
    findUnique.mockResolvedValue({ attempts: 6, failureCount: 0 })
    const res = await ackFailed('job-1', 'crash', {})
    expect(res.terminal).toBe(true)
  })

  it('leases acumulados NAO esgotam o retry de negocio (split attempts/failureCount)', async () => {
    // 4 leases (crashes re-claimados) mas apenas 1 falha de negocio real:
    // ainda re-tenta — antes do split, attempts>=3 mataria o job aqui.
    findUnique.mockResolvedValue({ attempts: 4, failureCount: 0 })
    const res = await ackFailed('job-1', 'network blip', { reasonCode: 'network' })
    expect(res.terminal).toBe(false)
  })

  it('permanent=true (poison) e FAILED imediato sem retry, em qualquer contagem', async () => {
    findUnique.mockResolvedValue({ attempts: 1, failureCount: 0 })
    const res = await ackFailed('job-1', 'payload invalido', {
      reasonCode: 'validation',
      permanent: true,
    })
    expect(res.terminal).toBe(true)
    expect(update.mock.calls[0][0].data.status).toBe('FAILED')
    expect(update.mock.calls[0][0].data.reasonCode).toBe('validation')
  })
})

describe('sweepQueueRetention — retencao da fila (task 03)', () => {
  it('apaga DONE/FAILED alem da janela configurada', async () => {
    _resetQueueSweepThrottle()
    deleteMany.mockResolvedValue({ count: 5 })
    const res = await sweepQueueRetention(true)
    expect(res.skipped).toBe(false)
    expect(deleteMany).toHaveBeenCalledTimes(2)
    const statuses = deleteMany.mock.calls.map((c) => c[0].where.status).sort()
    expect(statuses).toEqual(['DONE', 'FAILED'])
  })

  it('throttle: segunda chamada na mesma hora e skip', async () => {
    _resetQueueSweepThrottle()
    deleteMany.mockResolvedValue({ count: 0 })
    await sweepQueueRetention()
    const second = await sweepQueueRetention()
    expect(second.skipped).toBe(true)
  })
})
