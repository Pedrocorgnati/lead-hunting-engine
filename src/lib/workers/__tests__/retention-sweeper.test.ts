/**
 * R-04 intake-review: testes unit do retention-sweeper.
 * Mocka prisma + getConfig; valida anonimizacao por entidade e parcial-failure.
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    waitlistEntry: { findMany: jest.fn(), update: jest.fn() },
    contactMessage: { findMany: jest.fn(), update: jest.fn() },
    landingConsent: { updateMany: jest.fn() },
    exportHistory: { updateMany: jest.fn() },
    leadHistory: { updateMany: jest.fn() },
  },
}))

jest.mock('@/lib/services/system-config', () => ({
  getConfig: jest.fn(async (key: string) => {
    const m: Record<string, { value: number }> = {
      'retention.waitlist_entry_days': { value: 365 },
      'retention.contact_message_days': { value: 180 },
      'retention.landing_consent_days': { value: 730 },
      'retention.export_history_days': { value: 30 },
      'retention.lead_history_snapshot_days': { value: 90 },
    }
    return m[key] ?? { value: 30 }
  }),
}))

import {
  sweepWaitlist,
  sweepContactMessages,
  sweepLandingConsents,
  sweepExportHistory,
  sweepLeadHistorySnapshots,
  runRetentionSweep,
} from '../retention-sweeper'
import { prisma } from '@/lib/prisma'

const waitlistFind = prisma.waitlistEntry.findMany as jest.MockedFunction<
  typeof prisma.waitlistEntry.findMany
>
const waitlistUpdate = prisma.waitlistEntry.update as jest.MockedFunction<
  typeof prisma.waitlistEntry.update
>
const contactFind = prisma.contactMessage.findMany as jest.MockedFunction<
  typeof prisma.contactMessage.findMany
>
const contactUpdate = prisma.contactMessage.update as jest.MockedFunction<
  typeof prisma.contactMessage.update
>
const consentUpdateMany = prisma.landingConsent.updateMany as jest.MockedFunction<
  typeof prisma.landingConsent.updateMany
>
const exportUpdateMany = prisma.exportHistory.updateMany as jest.MockedFunction<
  typeof prisma.exportHistory.updateMany
>
const leadHistoryUpdateMany = prisma.leadHistory.updateMany as jest.MockedFunction<
  typeof prisma.leadHistory.updateMany
>

beforeEach(() => {
  jest.clearAllMocks()
})

describe('sweepWaitlist', () => {
  it('hashes email and nulls name for expired entries', async () => {
    waitlistFind.mockResolvedValue([
      { id: 'w1', email: 'alice@test.com' },
      { id: 'w2', email: 'bob@test.com' },
    ] as never)
    waitlistUpdate.mockResolvedValue({} as never)

    const res = await sweepWaitlist()

    expect(res.entity).toBe('WaitlistEntry')
    expect(res.count).toBe(2)
    expect(waitlistUpdate).toHaveBeenCalledTimes(2)
    const call0 = waitlistUpdate.mock.calls[0][0] as { data: { email: string; name: null } }
    expect(call0.data.email).toMatch(/^sha256:/)
    expect(call0.data.name).toBeNull()
  })

  it('skips entries already anonymized (NOT starts with sha256:)', async () => {
    waitlistFind.mockResolvedValue([] as never)
    const res = await sweepWaitlist()
    expect(res.count).toBe(0)
    expect(waitlistUpdate).not.toHaveBeenCalled()
  })
})

describe('sweepContactMessages', () => {
  it('hashes email, nulls name, replaces message with sentinel', async () => {
    contactFind.mockResolvedValue([{ id: 'c1', email: 'client@test.com' }] as never)
    contactUpdate.mockResolvedValue({} as never)

    const res = await sweepContactMessages()

    expect(res.count).toBe(1)
    const call = contactUpdate.mock.calls[0][0] as {
      data: { email: string; name: null; message: string }
    }
    expect(call.data.email).toMatch(/^sha256:/)
    expect(call.data.message).toBe('[anonimizado]')
  })
})

describe('sweepLandingConsents', () => {
  it('updates ipHash to anonymized marker', async () => {
    consentUpdateMany.mockResolvedValue({ count: 5 } as never)
    const res = await sweepLandingConsents()
    expect(res.entity).toBe('LandingConsent')
    expect(res.count).toBe(5)
    const call = consentUpdateMany.mock.calls[0][0] as {
      data: { ipHash: string }
    }
    expect(call.data.ipHash).toMatch(/^anonymized:/)
  })
})

describe('sweepExportHistory (R-07)', () => {
  it('sets status=EXPIRED, clears fileUrl and anonymizes filters', async () => {
    exportUpdateMany.mockResolvedValue({ count: 3 } as never)
    const res = await sweepExportHistory()
    expect(res.count).toBe(3)
    const call = exportUpdateMany.mock.calls[0][0] as {
      data: {
        status: string
        fileUrl: null
        filters: { anonymized: boolean; anonymizedAt: string }
      }
    }
    expect(call.data.status).toBe('EXPIRED')
    expect(call.data.fileUrl).toBeNull()
    expect(call.data.filters.anonymized).toBe(true)
    expect(call.data.filters.anonymizedAt).toEqual(expect.any(String))
  })
})

describe('sweepLeadHistorySnapshots', () => {
  it('overwrites oldValue/newValue with anonymized marker', async () => {
    leadHistoryUpdateMany.mockResolvedValue({ count: 10 } as never)
    const res = await sweepLeadHistorySnapshots()
    expect(res.count).toBe(10)
    const call = leadHistoryUpdateMany.mock.calls[0][0] as {
      data: { oldValue: unknown; newValue: unknown }
    }
    expect(call.data.oldValue).toEqual({ anonymized: true })
    expect(call.data.newValue).toEqual({ anonymized: true })
  })
})

describe('runRetentionSweep', () => {
  it('returns 5 results when all succeed', async () => {
    waitlistFind.mockResolvedValue([] as never)
    contactFind.mockResolvedValue([] as never)
    consentUpdateMany.mockResolvedValue({ count: 0 } as never)
    exportUpdateMany.mockResolvedValue({ count: 0 } as never)
    leadHistoryUpdateMany.mockResolvedValue({ count: 0 } as never)

    const results = await runRetentionSweep()

    expect(results).toHaveLength(5)
    expect(results.map((r) => r.entity)).toEqual([
      'WaitlistEntry',
      'ContactMessage',
      'LandingConsent',
      'ExportHistory',
      'LeadHistory',
    ])
  })

  it('tolerates partial failure — failed entity reports count=-1', async () => {
    waitlistFind.mockRejectedValue(new Error('db timeout'))
    contactFind.mockResolvedValue([] as never)
    consentUpdateMany.mockResolvedValue({ count: 0 } as never)
    exportUpdateMany.mockResolvedValue({ count: 0 } as never)
    leadHistoryUpdateMany.mockResolvedValue({ count: 0 } as never)

    const results = await runRetentionSweep()

    expect(results).toHaveLength(5)
    const failed = results.find((r) => r.count === -1)
    expect(failed).toBeDefined()
  })
})
