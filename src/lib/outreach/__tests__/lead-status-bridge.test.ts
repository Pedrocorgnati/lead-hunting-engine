/**
 * outreach-engine (06-10, tasks 02/09/22): ponte transacional + consistência.
 * Aceite: transição guardada perde sob estado stale (sem race); divergência
 * Lead.status vs último ContactEvent é detectada (regra 9.1).
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    lead: { findUnique: jest.fn() },
    contactEvent: { findFirst: jest.fn() },
  },
}))

import { guardedLeadTransition, checkLeadEventConsistency } from '../lead-status-bridge'
import { prisma } from '@/lib/prisma'

const leadFind = prisma.lead.findUnique as jest.Mock
const ceFind = prisma.contactEvent.findFirst as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('guardedLeadTransition', () => {
  it('aplica transição válida com guard de status (count=1)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 })
    const tx = { lead: { updateMany } } as never
    const ok = await guardedLeadTransition(tx, 'lead-1', 'NEW', 'CONTACTED')
    expect(ok).toBe(true)
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lead-1', status: 'NEW' } }),
    )
  })

  it('perde silenciosamente quando o estado já mudou (count=0, sem sobrescrever)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 })
    const tx = { lead: { updateMany } } as never
    const ok = await guardedLeadTransition(tx, 'lead-1', 'NEW', 'CONTACTED')
    expect(ok).toBe(false)
  })

  it('recusa transição inválida sem tocar o banco', async () => {
    const updateMany = jest.fn()
    const tx = { lead: { updateMany } } as never
    const ok = await guardedLeadTransition(tx, 'lead-1', 'CONVERTED', 'NEW')
    expect(ok).toBe(false)
    expect(updateMany).not.toHaveBeenCalled()
  })
})

describe('checkLeadEventConsistency (regra 9.1)', () => {
  it('consistente quando não há evento', async () => {
    leadFind.mockResolvedValue({ status: 'NEW' })
    ceFind.mockResolvedValue(null)
    const r = await checkLeadEventConsistency('lead-1')
    expect(r.consistent).toBe(true)
  })

  it('detecta divergência: último SENT mas lead segue NEW', async () => {
    leadFind.mockResolvedValue({ status: 'NEW' })
    ceFind.mockResolvedValue({ outcome: 'SENT', createdAt: new Date() })
    const r = await checkLeadEventConsistency('lead-1')
    expect(r.consistent).toBe(false)
    expect(r.detail).toMatch(/CONTACTED/)
  })

  it('estado adiante do alvo é progresso, não divergência', async () => {
    // SENT => alvo CONTACTED; lead já NEGOTIATING (adiante) => consistente.
    leadFind.mockResolvedValue({ status: 'NEGOTIATING' })
    ceFind.mockResolvedValue({ outcome: 'SENT', createdAt: new Date() })
    const r = await checkLeadEventConsistency('lead-1')
    expect(r.consistent).toBe(true)
  })

  it('outcome sem transição automática (AMBIGUOUS) é consistente', async () => {
    leadFind.mockResolvedValue({ status: 'CONTACTED' })
    ceFind.mockResolvedValue({ outcome: 'AMBIGUOUS', createdAt: new Date() })
    const r = await checkLeadEventConsistency('lead-1')
    expect(r.consistent).toBe(true)
  })
})
