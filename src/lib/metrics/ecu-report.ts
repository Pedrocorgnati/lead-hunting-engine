import { prisma } from '@/lib/prisma'
import { TELEMETRY_KINDS, telemetrySeverity, type TelemetryEventKind } from '@/lib/telemetry'

/**
 * Relatorio ECU (C14.4 / item 071): agrega os eventos de telemetria
 * (audit_logs com action em TELEMETRY_KINDS) por fluxo, severidade, usuario,
 * rota, provider e dia, dentro de uma janela em dias.
 */
export interface EcuReport {
  periodDays: number
  generatedAt: string
  totalEvents: number
  byKind: Record<string, number>
  bySeverity: Record<'error' | 'warning' | 'info', number>
  byRoute: Record<string, number>
  byUser: Record<string, number>
  byProvider: Record<string, number>
  byDay: Record<string, number>
}

const SAMPLE_CAP = 10_000

export async function buildEcuReport(periodDays = 7): Promise<EcuReport> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: TELEMETRY_KINDS }, createdAt: { gte: since } },
    select: { action: true, userId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: SAMPLE_CAP,
  })

  const report: EcuReport = {
    periodDays,
    generatedAt: new Date().toISOString(),
    totalEvents: rows.length,
    byKind: {},
    bySeverity: { error: 0, warning: 0, info: 0 },
    byRoute: {},
    byUser: {},
    byProvider: {},
    byDay: {},
  }

  for (const row of rows) {
    const kind = row.action as TelemetryEventKind
    report.byKind[kind] = (report.byKind[kind] ?? 0) + 1
    report.bySeverity[telemetrySeverity(kind)] += 1

    const meta = (row.metadata ?? {}) as Record<string, unknown>
    const route = typeof meta.route === 'string' ? meta.route : '(sem rota)'
    report.byRoute[route] = (report.byRoute[route] ?? 0) + 1

    const userKey = row.userId ?? '(sistema)'
    report.byUser[userKey] = (report.byUser[userKey] ?? 0) + 1

    if (typeof meta.provider === 'string' && meta.provider) {
      report.byProvider[meta.provider] = (report.byProvider[meta.provider] ?? 0) + 1
    }

    const day = row.createdAt.toISOString().slice(0, 10)
    report.byDay[day] = (report.byDay[day] ?? 0) + 1
  }

  return report
}

/** Export CSV do relatorio (dimensao;chave;contagem). */
export function ecuReportToCsv(report: EcuReport): string {
  const lines = ['dimensao;chave;contagem']
  const dims: Array<[string, Record<string, number>]> = [
    ['kind', report.byKind],
    ['severidade', report.bySeverity as unknown as Record<string, number>],
    ['rota', report.byRoute],
    ['usuario', report.byUser],
    ['provider', report.byProvider],
    ['dia', report.byDay],
  ]
  for (const [dim, map] of dims) {
    for (const [key, count] of Object.entries(map)) {
      lines.push(`${dim};"${key.replace(/"/g, '""')}";${count}`)
    }
  }
  return lines.join('\n')
}
