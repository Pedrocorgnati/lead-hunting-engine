/**
 * API daily calls check — alerta quando chamadas externas (kind=API) do dia
 * corrente excedem `alert.api.daily_calls`. Dedup diario.
 *
 * Origem: TASK-13 intake-review / ST003 (CL-114).
 */
import { prisma } from '@/lib/prisma'
import { getConfig } from '@/lib/services/system-config'
import { claimAlertSlot } from './dedup'
import { dispatch } from '@/lib/notifications/dispatcher'

interface CheckResult {
  triggered: boolean
  currentCalls: number
  threshold: number
}

function startOfDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export async function checkApiDailyThreshold(): Promise<CheckResult> {
  const cfg = await getConfig<{ threshold: number }>('alert.api.daily_calls')
  const threshold = Number(cfg.threshold ?? 10_000)

  const count = await prisma.apiUsageLog.count({
    where: { kind: 'API', timestamp: { gte: startOfDay() } },
  })

  if (count < threshold) {
    return { triggered: false, currentCalls: count, threshold }
  }

  const ok = await claimAlertSlot('API_DAILY', { count, threshold })
  if (!ok) return { triggered: false, currentCalls: count, threshold }

  const admins = await prisma.userProfile.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  })
  await Promise.all(
    admins.map((a) =>
      dispatch({
        event: 'LIMIT_REACHED',
        userId: a.id,
        params: { kind: 'api-daily', count, threshold },
        title: 'Alerta: consumo de API excedeu limite diario',
        message: `Chamadas de API atingiram ${count} / ${threshold} hoje.`,
      }).catch(() => undefined)
    )
  )

  return { triggered: true, currentCalls: count, threshold }
}
