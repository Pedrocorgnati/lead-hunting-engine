/**
 * LLM threshold check — dispara alerta quando custo LLM do mes corrente
 * excede `alert.llm.monthly_usd`. Dedup diario via SentAlert.
 *
 * Origem: TASK-13 intake-review / ST003 (CL-124).
 */
import { prisma } from '@/lib/prisma'
import { getConfig } from '@/lib/services/system-config'
import { claimAlertSlot } from './dedup'
import { dispatch } from '@/lib/notifications/dispatcher'

interface CheckResult {
  triggered: boolean
  currentUsd: number
  threshold: number
  recipients: number
}

function startOfMonth(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

export async function checkLlmMonthlyThreshold(): Promise<CheckResult> {
  const cfg = await getConfig<{ threshold: number }>('alert.llm.monthly_usd')
  const threshold = Number(cfg.threshold ?? 50)

  const agg = await prisma.apiUsageLog.aggregate({
    where: { kind: 'LLM', timestamp: { gte: startOfMonth() } },
    _sum: { costUsd: true },
  })
  const currentUsd = Number(agg._sum.costUsd ?? 0)

  if (currentUsd < threshold) {
    return { triggered: false, currentUsd, threshold, recipients: 0 }
  }

  const ok = await claimAlertSlot('LLM_MONTHLY', { currentUsd, threshold })
  if (!ok) return { triggered: false, currentUsd, threshold, recipients: 0 }

  const admins = await prisma.userProfile.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  })

  await Promise.all(
    admins.map((a) =>
      dispatch({
        event: 'LIMIT_REACHED',
        userId: a.id,
        params: {
          kind: 'llm',
          currentUsd: currentUsd.toFixed(2),
          threshold: threshold.toFixed(2),
        },
        title: 'Alerta: custo LLM excedeu limite mensal',
        message: `Custo LLM atingiu USD ${currentUsd.toFixed(2)} / ${threshold.toFixed(2)} este mes.`,
      }).catch(() => undefined)
    )
  )

  return { triggered: true, currentUsd, threshold, recipients: admins.length }
}
