jest.mock('@/lib/prisma', () => ({
  prisma: { auditLog: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() } },
}))

import { track, telemetrySeverity, TELEMETRY_KINDS } from '@/lib/telemetry'
import { buildEcuReport, ecuReportToCsv } from '@/lib/metrics/ecu-report'
import { prisma } from '@/lib/prisma'

const mockPrisma = prisma as unknown as {
  auditLog: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock }
}

beforeEach(() => jest.clearAllMocks())

describe('telemetry track (C14.1)', () => {
  it('persiste evento com correlationId, severity, route e flag telemetry', async () => {
    mockPrisma.auditLog.create.mockResolvedValue({})
    await track({
      kind: 'pitch.generated',
      correlationId: 'tel:abc',
      userId: 'u1',
      resourceId: 'lead-1',
      resourceType: 'lead',
      route: '/leads/lead-1?tab=pitch',
      metadata: { tone: 'formal', apiToken: 'segredo' },
    })
    const data = mockPrisma.auditLog.create.mock.calls[0][0].data
    expect(data.action).toBe('pitch.generated')
    expect(data.metadata.correlationId).toBe('tel:abc')
    expect(data.metadata.telemetry).toBe(true)
    expect(data.metadata.severity).toBe('info')
    expect(data.metadata.route).toBe('/leads/lead-1?tab=pitch')
    // mascaramento de chave sensivel
    expect(data.metadata.apiToken).toBe('[REDACTED]')
  })

  it('nunca propaga falha de persistencia', async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error('db down'))
    await expect(
      track({ kind: 'cron.executed', correlationId: 'c', userId: null }),
    ).resolves.toBeUndefined()
  })
})

describe('telemetrySeverity (C14.4)', () => {
  it('classifica erro/aviso/info por classe de evento', () => {
    expect(telemetrySeverity('collection.failed')).toBe('error')
    expect(telemetrySeverity('pitch.failed')).toBe('error')
    expect(telemetrySeverity('flow.abandoned')).toBe('warning')
    expect(telemetrySeverity('notification.dispatched')).toBe('info')
  })

  it('todo kind do schema tem severidade definida', () => {
    for (const kind of TELEMETRY_KINDS) {
      expect(['error', 'warning', 'info']).toContain(telemetrySeverity(kind))
    }
  })
})

describe('buildEcuReport (C14.4)', () => {
  it('agrega por kind, severidade, rota, usuario, provider e dia', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { action: 'pitch.generated', userId: 'u1', createdAt: new Date('2026-06-09T10:00:00Z'), metadata: { route: '/leads/1', provider: 'anthropic' } },
      { action: 'pitch.failed', userId: 'u1', createdAt: new Date('2026-06-09T11:00:00Z'), metadata: { route: '/leads/2' } },
      { action: 'flow.abandoned', userId: 'u2', createdAt: new Date('2026-06-08T09:00:00Z'), metadata: {} },
    ])
    const report = await buildEcuReport(7)
    expect(report.totalEvents).toBe(3)
    expect(report.byKind['pitch.generated']).toBe(1)
    expect(report.bySeverity).toEqual({ error: 1, warning: 1, info: 1 })
    expect(report.byRoute['/leads/1']).toBe(1)
    expect(report.byRoute['(sem rota)']).toBe(1)
    expect(report.byUser['u1']).toBe(2)
    expect(report.byProvider['anthropic']).toBe(1)
    expect(report.byDay['2026-06-09']).toBe(2)
    expect(report.byDay['2026-06-08']).toBe(1)
  })

  it('CSV cobre todas as dimensoes com header', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { action: 'cron.executed', userId: null, createdAt: new Date('2026-06-09T03:00:00Z'), metadata: { route: '(cron)' } },
    ])
    const report = await buildEcuReport(7)
    const csv = ecuReportToCsv(report)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('dimensao;chave;contagem')
    expect(csv).toContain('kind;"cron.executed";1')
    expect(csv).toContain('usuario;"(sistema)";1')
  })
})
