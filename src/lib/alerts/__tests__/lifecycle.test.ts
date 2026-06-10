jest.mock('@/lib/prisma', () => ({
  prisma: {
    sentAlert: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

import { effectiveStatus, toAlertView, applyAlertAction } from '../lifecycle'
import { prisma } from '@/lib/prisma'
import type { SentAlert } from '@prisma/client'

const mockPrisma = prisma as unknown as {
  sentAlert: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock }
}

const NOW = new Date('2026-06-09T12:00:00Z')

function row(overrides: Partial<SentAlert> = {}): SentAlert {
  return {
    id: 'a1',
    rule: 'LLM_MONTHLY',
    dayKey: '2026-06-09',
    payload: {},
    status: 'ACTIVE',
    severity: 'high',
    message: 'Custo LLM atingiu USD 60.00 / 50.00 este mes.',
    silencedUntil: null,
    resolvedAt: null,
    updatedBy: null,
    createdAt: new Date('2026-06-09T10:00:00Z'),
    ...overrides,
  } as SentAlert
}

beforeEach(() => jest.clearAllMocks())

describe('effectiveStatus', () => {
  it('ACTIVE permanece ACTIVE', () => {
    expect(effectiveStatus(row(), NOW)).toBe('ACTIVE')
  })

  it('SILENCED com snooze vigente permanece SILENCED', () => {
    expect(
      effectiveStatus(row({ status: 'SILENCED', silencedUntil: new Date('2026-06-10T10:00:00Z') }), NOW),
    ).toBe('SILENCED')
  })

  it('SILENCED com snooze expirado volta a ACTIVE', () => {
    expect(
      effectiveStatus(row({ status: 'SILENCED', silencedUntil: new Date('2026-06-09T11:00:00Z') }), NOW),
    ).toBe('ACTIVE')
  })

  it('RESOLVED e terminal', () => {
    expect(effectiveStatus(row({ status: 'RESOLVED' }), NOW)).toBe('RESOLVED')
  })
})

describe('toAlertView', () => {
  it('mapeia rule conhecida para nome amigavel', () => {
    expect(toAlertView(row(), NOW).name).toBe('Custo LLM mensal acima do limite')
  })

  it('cai no proprio rule para regras desconhecidas e gera mensagem default', () => {
    const view = toAlertView(row({ rule: 'NOVA_REGRA', message: null }), NOW)
    expect(view.name).toBe('NOVA_REGRA')
    expect(view.message).toContain('NOVA_REGRA')
  })
})

describe('applyAlertAction', () => {
  it('retorna null para alerta inexistente', async () => {
    mockPrisma.sentAlert.findUnique.mockResolvedValue(null)
    expect(await applyAlertAction('x', 'resolve', 'admin1')).toBeNull()
    expect(mockPrisma.sentAlert.update).not.toHaveBeenCalled()
  })

  it('silence grava SILENCED com silencedUntil futuro', async () => {
    mockPrisma.sentAlert.findUnique.mockResolvedValue(row())
    mockPrisma.sentAlert.update.mockImplementation(({ data }: { data: Partial<SentAlert> }) =>
      Promise.resolve(row({ ...data })),
    )
    const view = await applyAlertAction('a1', 'silence', 'admin1', 24)
    expect(view?.status).toBe('SILENCED')
    const call = mockPrisma.sentAlert.update.mock.calls[0][0]
    expect(call.data.status).toBe('SILENCED')
    expect(call.data.silencedUntil.getTime()).toBeGreaterThan(Date.now())
    expect(call.data.updatedBy).toBe('admin1')
  })

  it('resolve grava RESOLVED com resolvedAt e limpa snooze', async () => {
    mockPrisma.sentAlert.findUnique.mockResolvedValue(row({ status: 'SILENCED', silencedUntil: new Date() }))
    mockPrisma.sentAlert.update.mockImplementation(({ data }: { data: Partial<SentAlert> }) =>
      Promise.resolve(row({ ...data })),
    )
    const view = await applyAlertAction('a1', 'resolve', 'admin1')
    expect(view?.status).toBe('RESOLVED')
    const call = mockPrisma.sentAlert.update.mock.calls[0][0]
    expect(call.data.silencedUntil).toBeNull()
    expect(call.data.resolvedAt).toBeInstanceOf(Date)
  })

  it('reopen volta a ACTIVE limpando snooze e resolvedAt', async () => {
    mockPrisma.sentAlert.findUnique.mockResolvedValue(row({ status: 'RESOLVED', resolvedAt: new Date() }))
    mockPrisma.sentAlert.update.mockImplementation(({ data }: { data: Partial<SentAlert> }) =>
      Promise.resolve(row({ ...data })),
    )
    const view = await applyAlertAction('a1', 'reopen', 'admin1')
    expect(view?.status).toBe('ACTIVE')
    const call = mockPrisma.sentAlert.update.mock.calls[0][0]
    expect(call.data).toMatchObject({ status: 'ACTIVE', silencedUntil: null, resolvedAt: null })
  })
})
