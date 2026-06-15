/**
 * outreach-engine (06-10, fix da revisão): recovery de dispatches órfãos.
 * Aceite: LOCKED stale -> SCHEDULED (re-tentável); SENDING stale -> AMBIGUOUS
 * (pode ter enviado; replay humano, nunca re-envio cego). Zero Estados
 * Indefinidos — crash de processo não deixa o lead em deadlock permanente.
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    outreachDispatch: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 0 })) },
    outreachMailbox: { findMany: jest.fn(async () => []) },
    localQueueJob: { findFirst: jest.fn(async () => null) },
  },
}))
jest.mock('@/lib/workers/outreach-dispatch', () => ({
  dispatchOutreachSend: jest.fn(async () => ({ mode: 'local_queue' })),
  dispatchOutreachReplySync: jest.fn(async () => ({ mode: 'local_queue' })),
}))
jest.mock('@/lib/services/system-config', () => ({
  getConfig: jest.fn(async () => ({})),
  setConfig: jest.fn(async () => undefined),
}))
jest.mock('@/lib/telemetry', () => ({ track: jest.fn(async () => undefined), makeCorrelationId: jest.fn(() => 'c') }))
jest.mock('@/lib/outreach/drift-monitor', () => ({ runDriftMonitor: jest.fn(async () => ({ anomalous: false, pausedCampaigns: 0 })) }))
jest.mock('@/lib/outreach/sla-priority', () => ({ reprioritizeDispatches: jest.fn(async () => ({ reprioritized: 0, slaBreaches: 0 })) }))

import { runOutreachScheduler } from '../outreach-scheduler'
import { prisma } from '@/lib/prisma'

const updateMany = prisma.outreachDispatch.updateMany as jest.Mock

beforeEach(() => jest.clearAllMocks())

it('reclama LOCKED stale -> SCHEDULED e SENDING stale -> AMBIGUOUS', async () => {
  updateMany
    .mockResolvedValueOnce({ count: 2 }) // LOCKED -> SCHEDULED
    .mockResolvedValueOnce({ count: 1 }) // SENDING -> AMBIGUOUS
  const res = await runOutreachScheduler(new Date('2026-06-10T12:00:00Z'))
  expect(res.reclaimedDispatches).toBe(3)

  const lockedCall = updateMany.mock.calls.find((c) => c[0].where.status === 'LOCKED')
  const sendingCall = updateMany.mock.calls.find((c) => c[0].where.status === 'SENDING')
  expect(lockedCall![0].data.status).toBe('SCHEDULED')
  expect(sendingCall![0].data.status).toBe('AMBIGUOUS')
  // SENDING usa cutoff por lockedAt (lease lógico), não re-envia cego
  expect(sendingCall![0].where.lockedAt.lt).toBeInstanceOf(Date)
})
