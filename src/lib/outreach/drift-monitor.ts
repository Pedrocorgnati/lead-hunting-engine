import 'server-only'

/**
 * outreach-engine (brainstorm 06-10, task 17 — F-17): drift pause automatico.
 * Observa erro, bounce, reply e contato invalido na janela; em anomalia,
 * pausa as campanhas ACTIVE. Retomada NUNCA e automatica — exige liberacao
 * explicita (resumeCampaign). As contagens da janela sao calculadas inline
 * (mesmo criterio das metricas da task 15, porem com janela em minutos).
 */
import { prisma } from '@/lib/prisma'
import { getConfig } from '@/lib/services/system-config'
import { pauseCampaign } from './campaign-service'
import { track, makeCorrelationId } from '@/lib/telemetry'

interface DriftConfig {
  enabled?: boolean
  windowMinutes?: number
  maxErrorRate?: number
  maxBounceRate?: number
  maxInvalidContactRate?: number
  minVolume?: number
}

export interface DriftResult {
  anomalous: boolean
  pausedCampaigns: number
  reasons: string[]
  metrics: {
    errorRate: number
    bounceRate: number
    invalidContactRate: number
    volume: number
  }
}

export async function runDriftMonitor(now: Date = new Date()): Promise<DriftResult> {
  const cfg = await getConfig<DriftConfig>('outreach.drift')
  const reasons: string[] = []
  if (cfg.enabled === false) {
    return { anomalous: false, pausedCampaigns: 0, reasons: ['drift monitor desabilitado'], metrics: { errorRate: 0, bounceRate: 0, invalidContactRate: 0, volume: 0 } }
  }

  const windowMinutes = Number(cfg.windowMinutes ?? 60)
  const since = new Date(now.getTime() - windowMinutes * 60_000)

  const [attempts, failed, sent, bounced, invalidContact] = await Promise.all([
    prisma.outreachDispatch.count({
      where: { updatedAt: { gte: since }, status: { in: ['SENT', 'FAILED', 'FAILED_PERMANENT', 'AMBIGUOUS'] } },
    }),
    prisma.outreachDispatch.count({
      where: { updatedAt: { gte: since }, status: { in: ['FAILED', 'FAILED_PERMANENT', 'AMBIGUOUS'] } },
    }),
    prisma.outreachDispatch.count({ where: { sentAt: { gte: since } } }),
    prisma.outreachDispatch.count({ where: { updatedAt: { gte: since }, replyOutcome: 'BOUNCED' } }),
    prisma.outreachDispatch.count({
      where: { updatedAt: { gte: since }, status: { in: ['FAILED', 'FAILED_PERMANENT'] }, reasonCode: { in: ['validation', 'suppression'] } },
    }),
  ])

  const volume = attempts
  const errorRate = volume > 0 ? failed / volume : 0
  const bounceDenom = sent + bounced
  const bounceRate = bounceDenom > 0 ? bounced / bounceDenom : 0
  const invalidContactRate = volume > 0 ? invalidContact / volume : 0

  const minVolume = Number(cfg.minVolume ?? 10)
  const metrics = { errorRate, bounceRate, invalidContactRate, volume }

  if (volume < minVolume) {
    return { anomalous: false, pausedCampaigns: 0, reasons: [`volume ${volume} abaixo do minimo para avaliar drift`], metrics }
  }

  if (errorRate > Number(cfg.maxErrorRate ?? 0.2)) {
    reasons.push(`taxa de erro ${(errorRate * 100).toFixed(1)}% acima do limiar`)
  }
  if (bounceRate > Number(cfg.maxBounceRate ?? 0.08)) {
    reasons.push(`bounce ${(bounceRate * 100).toFixed(1)}% acima do limiar`)
  }
  if (invalidContactRate > Number(cfg.maxInvalidContactRate ?? 0.15)) {
    reasons.push(`contato invalido ${(invalidContactRate * 100).toFixed(1)}% acima do limiar`)
  }

  if (reasons.length === 0) {
    return { anomalous: false, pausedCampaigns: 0, reasons: [], metrics }
  }

  // Anomalia: pausa todas as campanhas ACTIVE (sem retomada automatica).
  const active = await prisma.outreachCampaign.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  })
  for (const c of active) {
    await pauseCampaign(c.id, `drift automatico: ${reasons.join('; ')}`).catch(() => undefined)
  }

  await track({
    kind: 'outreach.campaign_paused',
    correlationId: makeCorrelationId('drift'),
    userId: null,
    resourceType: 'outreach',
    metadata: { driftReasons: reasons, metrics, pausedCount: active.length },
  }).catch(() => undefined)

  return { anomalous: true, pausedCampaigns: active.length, reasons, metrics }
}
