import { prisma } from '@/lib/prisma'

/**
 * Registry canonico dos cron jobs da plataforma (AD29 /admin/jobs/cron).
 *
 * As schedules ESPELHAM vercel.json > crons — qualquer mudanca la deve ser
 * refletida aqui (e vice-versa). O registry alimenta a listagem admin, o
 * trigger manual e o pause/resume (persistidos em SystemConfig com chaves
 * `cron.last_run.{id}` e `cron.paused.{id}`, fora do union tipado do
 * system-config service por serem chaves operacionais internas).
 */
export interface CronJobDef {
  id: string
  name: string
  description: string
  schedule: string
  path: string
}

export const CRON_REGISTRY: CronJobDef[] = [
  {
    id: 'retention-cleanup',
    name: 'Retencao LGPD (deletion requests)',
    description: 'Processa deletion requests vencidas (LGPD Art. 18) e anonimiza dados.',
    schedule: '0 3 * * *',
    path: '/api/v1/cron/retention-cleanup',
  },
  {
    id: 'credential-check',
    name: 'Credenciais expirando',
    description: 'Notifica admins sobre credenciais de API proximas da expiracao.',
    schedule: '0 4 * * *',
    path: '/api/v1/cron/credential-check',
  },
  {
    id: 'check-alerts',
    name: 'Alertas operacionais',
    description: 'Avalia thresholds de LLM mensal, API diaria e jobs travados.',
    schedule: '*/5 * * * *',
    path: '/api/v1/cron/check-alerts',
  },
  {
    id: 'drain-local-queue',
    name: 'Drenagem da fila local',
    description: 'Processa jobs assincronos da fila local (exports e workers).',
    schedule: '*/2 * * * *',
    path: '/api/cron/drain-local-queue',
  },
  {
    id: 'retention-sweep',
    name: 'Retention sweep (PII)',
    description: 'Varre entidades PII alem do prazo de retencao configurado.',
    schedule: '0 5 * * *',
    path: '/api/v1/cron/retention-sweep',
  },
  {
    id: 'lgpd-cleanup',
    name: 'Hard-delete LGPD',
    description: 'Hard-delete de contas 15 dias apos solicitacao de exclusao.',
    schedule: '0 3 * * *',
    path: '/api/cron/lgpd-cleanup',
  },
]

export function getCronJob(id: string): CronJobDef | undefined {
  return CRON_REGISTRY.find((j) => j.id === id)
}

const LAST_RUN_KEY = (id: string) => `cron.last_run.${id}`
const PAUSED_KEY = (id: string) => `cron.paused.${id}`

// Calcula a proxima execucao a partir da expressao cron (5 campos).
// Suporta os formatos usados em vercel.json: minuto asterisco, step (asterisco
// barra N) ou fixo; hora asterisco ou fixa; demais campos asterisco. Retorna
// null para expressoes fora desse subconjunto (fail-open: UI mostra "—" em vez
// de valor errado).
export function nextRunFromCron(expr: string, from: Date): Date | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [minF, hourF, domF, monF, dowF] = parts
  if (domF !== '*' || monF !== '*' || dowF !== '*') return null

  const candidate = new Date(from.getTime())
  candidate.setUTCSeconds(0, 0)
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)

  // Avanca minuto a minuto ate casar (limite de 48h cobre qualquer diaria).
  for (let i = 0; i < 48 * 60; i++) {
    const min = candidate.getUTCMinutes()
    const hour = candidate.getUTCHours()
    const minOk =
      minF === '*' ||
      (minF.startsWith('*/') ? min % Number(minF.slice(2)) === 0 : min === Number(minF))
    const hourOk =
      hourF === '*' ||
      (hourF.startsWith('*/') ? hour % Number(hourF.slice(2)) === 0 : hour === Number(hourF))
    if (minOk && hourOk && !Number.isNaN(min) && !Number.isNaN(hour)) return candidate
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)
  }
  return null
}

/** Registra a execucao de um cron (chamado pelos handlers; fire-and-forget). */
export async function recordCronRun(id: string, outcome: 'ok' | 'error' = 'ok'): Promise<void> {
  try {
    await prisma.systemConfig.upsert({
      where: { key: LAST_RUN_KEY(id) },
      create: { key: LAST_RUN_KEY(id), value: { at: new Date().toISOString(), outcome } },
      update: { value: { at: new Date().toISOString(), outcome } },
    })
  } catch {
    // Tracking nunca quebra o cron em si.
  }
}

export async function isCronPaused(id: string): Promise<boolean> {
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key: PAUSED_KEY(id) } })
    return Boolean((row?.value as { value?: boolean } | null)?.value)
  } catch {
    return false
  }
}

export async function setCronPaused(id: string, paused: boolean, by?: string): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key: PAUSED_KEY(id) },
    create: { key: PAUSED_KEY(id), value: { value: paused }, updatedBy: by },
    update: { value: { value: paused }, updatedBy: by },
  })
}

export interface CronJobStatus extends CronJobDef {
  status: 'ACTIVE' | 'DISABLED'
  lastRunAt: string | null
  lastOutcome: 'ok' | 'error' | null
  nextRunAt: string | null
}

/** Lista todos os crons com last-run, pause state e proxima execucao. */
export async function listCronJobs(now: Date = new Date()): Promise<CronJobStatus[]> {
  const keys = CRON_REGISTRY.flatMap((j) => [LAST_RUN_KEY(j.id), PAUSED_KEY(j.id)])
  const rows = await prisma.systemConfig.findMany({ where: { key: { in: keys } } })
  const byKey = new Map(rows.map((r) => [r.key, r.value]))

  return CRON_REGISTRY.map((job) => {
    const lastRun = byKey.get(LAST_RUN_KEY(job.id)) as { at?: string; outcome?: 'ok' | 'error' } | undefined
    const paused = Boolean((byKey.get(PAUSED_KEY(job.id)) as { value?: boolean } | undefined)?.value)
    const next = paused ? null : nextRunFromCron(job.schedule, now)
    return {
      ...job,
      status: paused ? 'DISABLED' : 'ACTIVE',
      lastRunAt: lastRun?.at ?? null,
      lastOutcome: lastRun?.outcome ?? null,
      nextRunAt: next ? next.toISOString() : null,
    }
  })
}
