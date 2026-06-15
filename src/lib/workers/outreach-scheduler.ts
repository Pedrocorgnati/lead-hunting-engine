import 'server-only'

/**
 * outreach-engine (brainstorm 06-10): scheduler do ciclo de outreach.
 * Roda por cron (*\/5min) e faz tres coisas:
 *  1. Re-enfileira dispatches SCHEDULED devidos (scheduledAt <= now) de
 *     campanhas ACTIVE — e o caminho de retomada apos defer por janela/
 *     kill-switch/gap (task 11: bloqueio nunca e falha hard).
 *  2. Dispara sync de respostas IMAP por caixa ativa com IMAP configurado
 *     (task 12; slot de 5min mantem a latencia de inbound < 10min,
 *     hipotese 12.3 do fonte).
 *  3. Alarme de fila parada (task 15/regra 9.1): fila local com PENDING
 *     antigo (>15min) sem erro conhecido => alerta + reducao do lote.
 */
import { prisma } from '@/lib/prisma'
import { dispatchOutreachSend, dispatchOutreachReplySync } from './outreach-dispatch'
import { getConfig, setConfig } from '@/lib/services/system-config'
import { track, makeCorrelationId } from '@/lib/telemetry'

export interface OutreachSchedulerResult {
  enqueuedDispatches: number
  replySyncs: number
  queueStalled: boolean
  driftAnomalous: boolean
  campaignsPaused: number
  reclaimedDispatches: number
  autoEnrolled: number
}

const DUE_BATCH = 50
const STALL_THRESHOLD_MS = 15 * 60 * 1000
// Lease logico de um dispatch: alem disso, LOCKED/SENDING sao orfaos (crash
// de processo entre claim e terminal). 2x o lease da fila (120s) por folga.
const DISPATCH_LEASE_MS = 4 * 60 * 1000

/**
 * Recovery de dispatches orfaos (Zero Estados Indefinidos): crash de processo
 * (OOM/SIGKILL/deploy/timeout serverless) entre o claim e o estado terminal
 * deixa o dispatch preso em LOCKED ou SENDING — e o partial-unique impede
 * qualquer novo envio para o mesmo lead/canal. O try/catch do worker so cobre
 * crashes no MESMO processo Node; este sweep cobre o resto.
 *  - LOCKED stale  -> SCHEDULED (nada foi enviado; seguro re-tentar)
 *  - SENDING stale -> AMBIGUOUS (pode ter enviado; exige replay humano, nunca
 *    re-envio cego — risco 3 do fonte)
 */
async function reclaimOrphanDispatches(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - DISPATCH_LEASE_MS)
  const [locked, sending] = await Promise.all([
    prisma.outreachDispatch.updateMany({
      where: { status: 'LOCKED', lockedAt: { lt: cutoff } },
      data: { status: 'SCHEDULED', lockedAt: null },
    }),
    prisma.outreachDispatch.updateMany({
      where: { status: 'SENDING', lockedAt: { lt: cutoff } },
      data: { status: 'AMBIGUOUS', reasonCode: 'unknown', failReason: 'processo morreu durante o envio — replay manual necessario (anti double-send)' },
    }),
  ])
  return locked.count + sending.count
}

export async function runOutreachScheduler(now: Date = new Date()): Promise<OutreachSchedulerResult> {
  // 0. Recovery de dispatches orfaos antes de tudo.
  const reclaimedDispatches = await reclaimOrphanDispatches(now).catch(() => 0)

  // 0.5. Auto-enroll: inscreve novos leads do grupo das campanhas com envio
  // automatico ligado (ate o cap diario). Os dispatches criados sao enviados
  // nos passos abaixo, dentro da janela/throttle da caixa.
  let autoEnrolled = 0
  try {
    const { runAutoEnrollment } = await import('@/lib/outreach/campaign-service')
    const ae = await runAutoEnrollment(now)
    autoEnrolled = ae.totalEnrolled
  } catch {
    // auto-enroll nao deve derrubar o scheduler
  }

  // 1. Dispatches devidos de campanhas ativas, por prioridade (task 21).
  const due = await prisma.outreachDispatch.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: now },
      campaign: { status: 'ACTIVE' },
    },
    orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }],
    take: DUE_BATCH,
    select: { id: true },
  })
  let enqueued = 0
  for (const d of due) {
    const res = await dispatchOutreachSend({ dispatchId: d.id }).catch(() => null)
    if (res && res.mode !== 'blocked') enqueued += 1
  }

  // 2. Reply-sync por caixa ativa com IMAP (slot de 5min para idempotencia).
  const mailboxes = await prisma.outreachMailbox.findMany({
    where: { status: 'ACTIVE', imapHost: { not: null } },
    select: { id: true },
  })
  const slot = new Date(Math.floor(now.getTime() / (5 * 60_000)) * 5 * 60_000).toISOString()
  let replySyncs = 0
  for (const m of mailboxes) {
    await dispatchOutreachReplySync({ mailboxId: m.id, syncSlot: slot }).catch(() => undefined)
    replySyncs += 1
  }

  // 3. Alarme de fila parada (regra 9.1): PENDING devido ha >15min sem
  // lastError conhecido => alerta + reduz lote do drain por 30min.
  const stalled = await prisma.localQueueJob.findFirst({
    where: {
      status: 'PENDING',
      runAt: { lte: new Date(now.getTime() - STALL_THRESHOLD_MS) },
      lastError: null,
    },
    select: { id: true, kind: true, runAt: true },
  })
  if (stalled) {
    const { claimAlertSlot } = await import('@/lib/alerts/dedup')
    await claimAlertSlot(
      'queue-drain-stall',
      { oldestJobId: stalled.id, kind: stalled.kind, runAt: stalled.runAt.toISOString() },
      now,
      {
        severity: 'high',
        message: 'LocalQueue sem drenar ha 15+ minutos sem erro conhecido — lote reduzido',
      },
    ).catch(() => undefined)

    const state = await getConfig<{ drainBatchSize?: number }>('outreach.throttle_state')
    await setConfig('outreach.throttle_state', {
      drainBatchSize: Number(state.drainBatchSize ?? 10),
      slowdownFactor: 2,
      slowdownUntil: new Date(now.getTime() + 30 * 60_000).toISOString(),
    }).catch(() => undefined)

    await track({
      kind: 'queue.stalled',
      correlationId: makeCorrelationId('queue'),
      userId: null,
      resourceType: 'local_queue',
      resourceId: stalled.id,
      metadata: { kind: stalled.kind, oldestRunAt: stalled.runAt.toISOString() },
    }).catch(() => undefined)
  }

  // 4. Drift monitor (task 17): pausa campanhas em anomalia (sem retomada
  // automatica). Depende das metricas da task 15.
  let driftAnomalous = false
  let campaignsPaused = 0
  try {
    const { runDriftMonitor } = await import('@/lib/outreach/drift-monitor')
    const drift = await runDriftMonitor(now)
    driftAnomalous = drift.anomalous
    campaignsPaused = drift.pausedCampaigns
  } catch {
    // drift nao deve derrubar o scheduler
  }

  // 5. Reprioriza por SLA (task 21) — best-effort, nao bloqueia.
  try {
    const { reprioritizeDispatches } = await import('@/lib/outreach/sla-priority')
    await reprioritizeDispatches(now)
  } catch {
    // sla reprioritization e best-effort
  }

  return {
    enqueuedDispatches: enqueued,
    replySyncs,
    queueStalled: Boolean(stalled),
    driftAnomalous,
    campaignsPaused,
    reclaimedDispatches,
    autoEnrolled,
  }
}
