/**
 * outreach-engine (3o passe, automatização): auto-enroll agendado.
 * Aceite: só campanhas ACTIVE+aprovadas+envio-real e com auto-enroll ligado
 * inscrevem leads; respeita o cap diário (conta dispatches já criados hoje);
 * delega ao enqueue (que aplica o envelope de qualidade).
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    outreachCampaign: { findMany: jest.fn(), findUnique: jest.fn() },
    outreachDispatch: { count: jest.fn() },
  },
}))
jest.mock('@/lib/telemetry', () => ({ track: jest.fn(async () => undefined), makeCorrelationId: jest.fn(() => 'c') }))

import { runAutoEnrollment, getCampaignAutoEnroll } from '../campaign-service'
import { prisma } from '@/lib/prisma'

const campFindMany = prisma.outreachCampaign.findMany as jest.Mock
const dispCount = prisma.outreachDispatch.count as jest.Mock

const NOW = new Date('2026-06-11T15:00:00Z')

beforeEach(() => jest.clearAllMocks())

describe('getCampaignAutoEnroll', () => {
  it('lê config do metadata com defaults', () => {
    expect(getCampaignAutoEnroll(null)).toEqual({ enabled: false, dailyCap: 25 })
    expect(getCampaignAutoEnroll({ autoEnroll: { enabled: true, dailyCap: 10 } })).toEqual({ enabled: true, dailyCap: 10 })
  })
  it('clampa dailyCap', () => {
    expect(getCampaignAutoEnroll({ autoEnroll: { enabled: true, dailyCap: 99999 } }).dailyCap).toBe(1000)
  })
})

describe('runAutoEnrollment', () => {
  it('pula campanha com auto-enroll desligado', async () => {
    campFindMany.mockResolvedValue([{ id: 'c1', name: 'A', metadata: { autoEnroll: { enabled: false } } }])
    const enqueue = jest.fn()
    const r = await runAutoEnrollment(NOW, { enqueue })
    expect(r.campaignsProcessed).toBe(0)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('inscreve até o cap diário restante', async () => {
    campFindMany.mockResolvedValue([{ id: 'c1', name: 'A', metadata: { autoEnroll: { enabled: true, dailyCap: 25 } } }])
    dispCount.mockResolvedValue(20) // já 20 hoje -> restante 5
    const enqueue = jest.fn().mockResolvedValue({ created: 5, skipped: [], dispatchIds: ['a', 'b', 'c', 'd', 'e'] })
    const r = await runAutoEnrollment(NOW, { enqueue })
    expect(enqueue).toHaveBeenCalledWith('c1', { limit: 5 })
    expect(r.totalEnrolled).toBe(5)
    expect(r.perCampaign[0].capReached).toBe(true)
  })

  it('não inscreve quando o cap diário já foi atingido', async () => {
    campFindMany.mockResolvedValue([{ id: 'c1', name: 'A', metadata: { autoEnroll: { enabled: true, dailyCap: 25 } } }])
    dispCount.mockResolvedValue(25)
    const enqueue = jest.fn()
    const r = await runAutoEnrollment(NOW, { enqueue })
    expect(enqueue).not.toHaveBeenCalled()
    expect(r.perCampaign[0].capReached).toBe(true)
  })

  it('só considera campanhas ACTIVE+aprovadas+envio-real (where do findMany)', async () => {
    campFindMany.mockResolvedValue([])
    await runAutoEnrollment(NOW, { enqueue: jest.fn() })
    expect(campFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'ACTIVE', dryRun: false, approvedBy: { not: null } },
    }))
  })
})
