jest.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    lead: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
  },
}))

import {
  extractSnapshotValues,
  diffValues,
  captureLeadSnapshot,
  restoreLeadSnapshot,
  diffLeadSnapshots,
  diffToCsv,
  SnapshotNotRestorableError,
  type SnapshotValues,
} from '../radar-snapshot'
import { prisma } from '@/lib/prisma'
import type { Lead } from '@prisma/client'

const mockPrisma = prisma as unknown as {
  auditLog: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock }
  lead: { update: jest.Mock; findUniqueOrThrow: jest.Mock }
}

function fakeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    userId: 'user-1',
    score: 80,
    temperature: 'HOT',
    status: 'NEW',
    website: 'https://a.com',
    phone: '+5511999999999',
    rating: 4.5,
    reviewCount: 10,
    instagramFollowers: 1200,
    facebookFollowers: 300,
    opportunities: ['WEBSITE_BROKEN'],
    problems: ['Site fora do ar'],
    suggestions: ['Refazer site'],
    ...overrides,
  } as unknown as Lead
}

function values(overrides: Partial<SnapshotValues> = {}): SnapshotValues {
  return { ...extractSnapshotValues(fakeLead()), ...overrides }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.auditLog.findMany.mockResolvedValue([])
})

describe('extractSnapshotValues', () => {
  it('extrai campos rastreados e converte Decimal de rating para number', () => {
    const v = extractSnapshotValues(fakeLead())
    expect(v.score).toBe(80)
    expect(v.rating).toBe(4.5)
    expect(v.opportunities).toEqual(['WEBSITE_BROKEN'])
  })
})

describe('diffValues', () => {
  it('retorna vazio sem snapshot anterior', () => {
    expect(diffValues(null, values())).toEqual({})
  })

  it('detecta mudancas escalares e de arrays', () => {
    const prev = values()
    const next = values({ score: 90, problems: ['Site fora do ar', 'Sem SSL'] })
    const diff = diffValues(prev, next)
    expect(diff.score).toEqual({ prev: 80, next: 90 })
    expect(diff.problems).toBeDefined()
    expect(Object.keys(diff)).toHaveLength(2)
  })
})

describe('captureLeadSnapshot', () => {
  it('persiste values + fields + changeCount no audit log', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: 's0', createdAt: new Date(), metadata: { values: values({ score: 70 }) } },
    ])
    mockPrisma.auditLog.create.mockImplementation(({ data, select: _select }: { data: { metadata: unknown }; select: unknown }) =>
      Promise.resolve({ id: 's1', createdAt: new Date('2026-06-09T12:00:00Z'), metadata: data.metadata }),
    )
    const view = await captureLeadSnapshot('user-1', fakeLead())
    expect(view.score).toBe(80)
    expect(view.changeCount).toBe(1)
    expect(view.fields.score).toEqual({ prev: 70, next: 80 })
    const created = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(created.action).toBe('lead.snapshot.captured')
    expect(created.metadata.values.score).toBe(80)
  })
})

describe('restoreLeadSnapshot', () => {
  it('retorna null quando snapshot nao existe para o lead', async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue(null)
    expect(await restoreLeadSnapshot('user-1', 'lead-1', 'x')).toBeNull()
    expect(mockPrisma.lead.update).not.toHaveBeenCalled()
  })

  it('lanca SNAPSHOT_NOT_RESTORABLE para snapshot legado sem values', async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue({
      id: 's-legacy', createdAt: new Date(), metadata: { correlationId: 'c1' },
    })
    await expect(restoreLeadSnapshot('user-1', 'lead-1', 's-legacy')).rejects.toThrow(
      SnapshotNotRestorableError,
    )
    expect(mockPrisma.lead.update).not.toHaveBeenCalled()
  })

  it('aplica values ao lead e registra novo snapshot de reversao', async () => {
    const snapValues = values({ score: 60, website: 'https://old.com' })
    mockPrisma.auditLog.findFirst.mockResolvedValue({
      id: 's-old', createdAt: new Date(), metadata: { values: snapValues },
    })
    mockPrisma.lead.update.mockResolvedValue({})
    mockPrisma.lead.findUniqueOrThrow.mockResolvedValue(fakeLead({ score: 60, website: 'https://old.com' }))
    mockPrisma.auditLog.create.mockImplementation(({ data }: { data: { metadata: unknown } }) =>
      Promise.resolve({ id: 's-new', createdAt: new Date(), metadata: data.metadata }),
    )

    const view = await restoreLeadSnapshot('user-1', 'lead-1', 's-old')
    expect(view?.score).toBe(60)
    const update = mockPrisma.lead.update.mock.calls[0][0]
    expect(update.data.score).toBe(60)
    expect(update.data.website).toBe('https://old.com')
    const created = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(created.action).toBe('lead.snapshot.restored')
    expect(created.metadata.restoredFrom).toBe('s-old')
  })
})

describe('diffLeadSnapshots', () => {
  it('retorna reason quando ha menos de dois snapshots com values', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: 's1', createdAt: new Date(), metadata: { values: values() } },
    ])
    const result = await diffLeadSnapshots('lead-1')
    expect(result.diff).toEqual({})
    expect(result.reason).toBeDefined()
  })

  it('compara os dois mais recentes por default (ignorando legados sem values)', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: 's3', createdAt: new Date('2026-06-09T12:00:00Z'), metadata: { values: values({ score: 90 }) } },
      { id: 's2-legacy', createdAt: new Date('2026-06-08T12:00:00Z'), metadata: { correlationId: 'c' } },
      { id: 's1', createdAt: new Date('2026-06-07T12:00:00Z'), metadata: { values: values({ score: 70 }) } },
    ])
    const result = await diffLeadSnapshots('lead-1')
    expect(result.to?.id).toBe('s3')
    expect(result.from?.id).toBe('s1')
    expect(result.diff.score).toEqual({ prev: 70, next: 90 })
    expect(result.reason).toBeUndefined()
  })
})

describe('diffToCsv', () => {
  it('gera CSV com header e escapa aspas/arrays', () => {
    const csv = diffToCsv({
      leadId: 'lead-1',
      from: { id: 'a', createdAt: '' },
      to: { id: 'b', createdAt: '' },
      diff: {
        score: { prev: 70, next: 90 },
        problems: { prev: ['Site "quebrado"'], next: ['Site ok'] },
      },
    })
    const lines = csv.split('\n')
    expect(lines[0]).toBe('campo;de;para')
    expect(lines[1]).toBe('score;"70";"90"')
    expect(lines[2]).toContain('""quebrado""')
  })
})
