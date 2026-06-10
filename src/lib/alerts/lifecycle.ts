import { prisma } from '@/lib/prisma'
import type { SentAlert } from '@prisma/client'

/**
 * Lifecycle de alertas operacionais (Task 45 / AD30) sobre `sent_alerts`.
 *
 * Estados: ACTIVE -> SILENCED (snooze ate silencedUntil) | RESOLVED.
 * Snooze expirado e normalizado de volta a ACTIVE no read-path (a linha nao
 * muda no banco ate a proxima escrita — o status efetivo e derivado).
 */
export type AlertStatus = 'ACTIVE' | 'SILENCED' | 'RESOLVED'

const RULE_NAMES: Record<string, string> = {
  LLM_MONTHLY: 'Custo LLM mensal acima do limite',
  API_DAILY: 'Consumo de API diario acima do limite',
  JOB_STUCK: 'Coletas travadas na fila',
}

export interface AlertView {
  id: string
  rule: string
  name: string
  status: AlertStatus
  severity: string
  message: string
  triggeredAt: string
  silencedUntil: string | null
  resolvedAt: string | null
}

export function effectiveStatus(alert: Pick<SentAlert, 'status' | 'silencedUntil'>, now: Date = new Date()): AlertStatus {
  if (alert.status === 'RESOLVED') return 'RESOLVED'
  if (alert.status === 'SILENCED') {
    if (alert.silencedUntil && alert.silencedUntil.getTime() <= now.getTime()) return 'ACTIVE'
    return 'SILENCED'
  }
  return 'ACTIVE'
}

export function toAlertView(alert: SentAlert, now: Date = new Date()): AlertView {
  return {
    id: alert.id,
    rule: alert.rule,
    name: RULE_NAMES[alert.rule] ?? alert.rule,
    status: effectiveStatus(alert, now),
    severity: alert.severity,
    message: alert.message ?? `Alerta ${alert.rule} disparado em ${alert.dayKey}.`,
    triggeredAt: alert.createdAt.toISOString(),
    silencedUntil: alert.silencedUntil?.toISOString() ?? null,
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
  }
}

export async function listAlerts(limit = 100): Promise<AlertView[]> {
  const rows = await prisma.sentAlert.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  const now = new Date()
  return rows.map((r) => toAlertView(r, now))
}

export type AlertAction = 'silence' | 'resolve' | 'reopen'

export async function applyAlertAction(
  id: string,
  action: AlertAction,
  by: string,
  snoozeHours = 24,
): Promise<AlertView | null> {
  const existing = await prisma.sentAlert.findUnique({ where: { id } })
  if (!existing) return null

  const data =
    action === 'silence'
      ? {
          status: 'SILENCED',
          silencedUntil: new Date(Date.now() + snoozeHours * 3_600_000),
          resolvedAt: null,
          updatedBy: by,
        }
      : action === 'resolve'
        ? { status: 'RESOLVED', resolvedAt: new Date(), silencedUntil: null, updatedBy: by }
        : { status: 'ACTIVE', resolvedAt: null, silencedUntil: null, updatedBy: by }

  const updated = await prisma.sentAlert.update({ where: { id }, data })
  return toAlertView(updated)
}
