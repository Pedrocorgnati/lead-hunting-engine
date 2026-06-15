import 'server-only'

/**
 * outreach-engine (brainstorm 06-10, task 15 — F-15/F-24): metricas minimas
 * de seguranca operacional (secao 10 do fonte) + funil de campanha. Calculo
 * on-read (padrao computeProviderHealth), sem materializacao.
 *
 * As 6 metricas minimas obrigatorias antes da ativacao em producao:
 *  outreach_send_attempts_total, outreach_send_success_total,
 *  outreach_send_ambiguous_total, outreach_bounce_total,
 *  queue_drain_lag_p95, reply_sync_lag_p95.
 */
import { prisma } from '@/lib/prisma'

export interface OutreachMetrics {
  windowHours: number
  outreach_send_attempts_total: number
  outreach_send_success_total: number
  outreach_send_ambiguous_total: number
  outreach_bounce_total: number
  outreach_suppressed_total: number
  queue_drain_lag_p95_seconds: number
  reply_sync_lag_p95_seconds: number
  bounce_rate: number
  reply_rate: number
}

async function p95LagSeconds(kind: string, now: Date): Promise<number> {
  // Lag = idade do PENDING mais antigo do kind (proxy de p95 de atraso de
  // drenagem; sem serie temporal materializada, usamos a cauda atual).
  const oldest = await prisma.localQueueJob.findFirst({
    where: { kind, status: 'PENDING', runAt: { lte: now } },
    orderBy: { runAt: 'asc' },
    select: { runAt: true },
  })
  if (!oldest) return 0
  return Math.max(0, Math.round((now.getTime() - oldest.runAt.getTime()) / 1000))
}

export async function computeOutreachMetrics(
  windowHours = 24,
  now: Date = new Date(),
): Promise<OutreachMetrics> {
  const since = new Date(now.getTime() - windowHours * 3600_000)

  const [attempts, success, ambiguous, bounced, suppressed] = await Promise.all([
    prisma.outreachDispatch.count({
      where: { status: { in: ['SENT', 'FAILED', 'FAILED_PERMANENT', 'AMBIGUOUS'] }, updatedAt: { gte: since } },
    }),
    prisma.outreachDispatch.count({ where: { status: 'SENT', sentAt: { gte: since } } }),
    prisma.outreachDispatch.count({ where: { status: 'AMBIGUOUS', updatedAt: { gte: since } } }),
    prisma.outreachDispatch.count({ where: { replyOutcome: 'BOUNCED', updatedAt: { gte: since } } }),
    prisma.outreachDispatch.count({ where: { status: 'SUPPRESSED', updatedAt: { gte: since } } }),
  ])

  const replies = await prisma.outreachDispatch.count({
    where: { repliedAt: { gte: since }, replyOutcome: { notIn: ['BOUNCED'] } },
  })

  const [drainLag, replyLag] = await Promise.all([
    p95LagSeconds('outreach-send', now),
    p95LagSeconds('outreach-reply-sync', now),
  ])

  const denom = success + bounced
  return {
    windowHours,
    outreach_send_attempts_total: attempts,
    outreach_send_success_total: success,
    outreach_send_ambiguous_total: ambiguous,
    outreach_bounce_total: bounced,
    outreach_suppressed_total: suppressed,
    queue_drain_lag_p95_seconds: drainLag,
    reply_sync_lag_p95_seconds: replyLag,
    bounce_rate: denom > 0 ? bounced / denom : 0,
    reply_rate: success > 0 ? replies / success : 0,
  }
}

export interface CampaignFunnel {
  campaignId: string
  name: string
  status: string
  scheduled: number
  sent: number
  bounced: number
  suppressed: number
  replied: number
  interested: number
  failed: number
  ambiguous: number
  contactedPer1k: number
  respondedPer100: number
}

/** Funil por campanha (F-15): collection -> qualification -> contact-event. */
export async function computeCampaignFunnels(): Promise<CampaignFunnel[]> {
  const campaigns = await prisma.outreachCampaign.findMany({
    where: { status: { notIn: ['DRAFT'] } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, name: true, status: true },
  })

  const funnels: CampaignFunnel[] = []
  for (const c of campaigns) {
    const grouped = await prisma.outreachDispatch.groupBy({
      by: ['status'],
      where: { campaignId: c.id },
      _count: { _all: true },
    })
    const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]))
    const [bounced, replied, interested] = await Promise.all([
      prisma.outreachDispatch.count({ where: { campaignId: c.id, replyOutcome: 'BOUNCED' } }),
      prisma.outreachDispatch.count({ where: { campaignId: c.id, repliedAt: { not: null } } }),
      prisma.outreachDispatch.count({ where: { campaignId: c.id, replyOutcome: 'INTERESTED' } }),
    ])
    const sent = byStatus.SENT ?? 0
    funnels.push({
      campaignId: c.id,
      name: c.name,
      status: c.status,
      scheduled: byStatus.SCHEDULED ?? 0,
      sent,
      bounced,
      suppressed: byStatus.SUPPRESSED ?? 0,
      replied,
      interested,
      failed: (byStatus.FAILED ?? 0) + (byStatus.FAILED_PERMANENT ?? 0),
      ambiguous: byStatus.AMBIGUOUS ?? 0,
      contactedPer1k: sent > 0 ? Math.round((sent / Math.max(1, sent + (byStatus.SCHEDULED ?? 0))) * 1000) : 0,
      respondedPer100: sent > 0 ? Math.round((replied / sent) * 100) : 0,
    })
  }
  return funnels
}

/**
 * Avalia os 3 alertas obrigatorios da secao 10 e os criterios de rejeicao da
 * secao 11.1. Retorna violacoes para o painel e para o gate de pre-flight.
 */
export interface MetricViolation {
  rule: string
  severity: 'high' | 'medium'
  message: string
}

export async function evaluateOutreachAlerts(now: Date = new Date()): Promise<MetricViolation[]> {
  const { getOutreachThresholds } = await import('@/lib/services/system-config')
  const thresholds = await getOutreachThresholds()
  const metrics = await computeOutreachMetrics(24, now)
  const violations: MetricViolation[] = []

  if (
    metrics.bounce_rate > thresholds.maxBounceRate &&
    metrics.outreach_send_success_total + metrics.outreach_bounce_total >= thresholds.minSampleForBounceRate
  ) {
    violations.push({
      rule: 'outreach-bounce-threshold',
      severity: 'high',
      message: `bounce-rate 24h ${(metrics.bounce_rate * 100).toFixed(1)}% acima do limiar`,
    })
  }
  if (metrics.outreach_send_ambiguous_total > 0) {
    violations.push({
      rule: 'outreach-ambiguous-growth',
      severity: 'medium',
      message: `${metrics.outreach_send_ambiguous_total} envios ambiguos na janela — revisar`,
    })
  }
  // Criterio 11.1: contact_event ausente em envio concluido > 1%.
  const sentWithoutEvent = await prisma.outreachDispatch.count({
    where: { status: 'SENT', contactEventId: null },
  })
  const totalSent = await prisma.outreachDispatch.count({ where: { status: 'SENT' } })
  if (totalSent > 0 && sentWithoutEvent / totalSent > 0.01) {
    violations.push({
      rule: 'outreach-contact-event-missing',
      severity: 'high',
      message: `${sentWithoutEvent}/${totalSent} envios sem ContactEvent (>1%)`,
    })
  }
  return violations
}
