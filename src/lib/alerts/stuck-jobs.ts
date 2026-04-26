/**
 * Stuck jobs check — dispara alerta quando um CollectionJob fica em status
 * PENDING por mais do que `alert.job.stuck_minutes` minutos.
 *
 * Origem: TASK-13 intake-review / ST003 (CL-172).
 */
import { prisma } from '@/lib/prisma'
import { getConfig } from '@/lib/services/system-config'
import { claimAlertSlot } from './dedup'
import { dispatch } from '@/lib/notifications/dispatcher'
import { CollectionJobStatus } from '@/lib/constants/enums'

interface CheckResult {
  triggered: boolean
  stuckCount: number
  threshold: number
}

export async function checkStuckJobs(): Promise<CheckResult> {
  const cfg = await getConfig<{ threshold: number }>('alert.job.stuck_minutes')
  const threshold = Number(cfg.threshold ?? 15)
  const cutoff = new Date(Date.now() - threshold * 60_000)

  const stuck = await prisma.collectionJob.findMany({
    where: {
      status: CollectionJobStatus.PENDING,
      createdAt: { lt: cutoff },
    },
    select: { id: true, userId: true, name: true, createdAt: true },
    take: 50,
  })

  if (stuck.length === 0) {
    return { triggered: false, stuckCount: 0, threshold }
  }

  // Dedup por dia (evita spam)
  const ok = await claimAlertSlot('JOB_STUCK', {
    count: stuck.length,
    threshold,
  })
  if (!ok) return { triggered: false, stuckCount: stuck.length, threshold }

  const admins = await prisma.userProfile.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  })

  await Promise.all(
    admins.map((a) =>
      dispatch({
        event: 'LIMIT_REACHED',
        userId: a.id,
        params: { kind: 'stuck-jobs', count: stuck.length, threshold },
        title: 'Alerta: coletas travadas',
        message: `${stuck.length} coleta(s) em PENDING ha mais de ${threshold} minutos.`,
      }).catch(() => undefined)
    )
  )

  return { triggered: true, stuckCount: stuck.length, threshold }
}
