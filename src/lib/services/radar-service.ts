import { prisma } from '@/lib/prisma'
import { CollectionJobStatus, DataSource } from '@/lib/constants/enums'
import { quotaEnforcer, QuotaExceededError } from './quota-enforcer'
import { dispatchCollectLeads } from '@/lib/workers/collect-dispatch'

export { QuotaExceededError }

export const RADAR_JOB_ORIGIN = 'RADAR'

export interface RadarPreset {
  city: string
  state: string | null
  niche: string
  lastCollectedAt: string | null
  jobsCount: number
  leadsCount: number
}

export interface RecollectInput {
  city: string
  state: string | null
  niche: string
  limit?: number
  sources?: DataSource[]
}

export interface RecollectResult {
  jobId: string
}

export class RadarService {
  /**
   * Lista combinacoes unicas regiao+nicho ja coletadas pelo operador,
   * ordenadas pela ultima execucao.
   */
  async listPresets(userId: string): Promise<RadarPreset[]> {
    const grouped = await prisma.collectionJob.groupBy({
      by: ['city', 'state', 'niche'],
      where: { userId, status: CollectionJobStatus.COMPLETED },
      _max: { completedAt: true },
      _sum: { resultCount: true },
      _count: { _all: true },
    })

    const presets: RadarPreset[] = grouped
      .filter((g) => (g._sum.resultCount ?? 0) > 0)
      .map((g) => ({
        city: g.city,
        state: g.state,
        niche: g.niche,
        lastCollectedAt: g._max.completedAt ? g._max.completedAt.toISOString() : null,
        jobsCount: g._count._all,
        leadsCount: g._sum.resultCount ?? 0,
      }))
      .sort((a, b) => {
        const aT = a.lastCollectedAt ? Date.parse(a.lastCollectedAt) : 0
        const bT = b.lastCollectedAt ? Date.parse(b.lastCollectedAt) : 0
        return bT - aT
      })

    return presets
  }

  /**
   * Cria um CollectionJob marcado como origin=RADAR, valida quota e enfileira.
   * Reutiliza parametros de coleta previa (cidade/estado/nicho).
   */
  async recollect(userId: string, input: RecollectInput): Promise<RecollectResult> {
    await this.assertQuota(userId)

    const sources = input.sources && input.sources.length > 0
      ? input.sources
      : [DataSource.GOOGLE_MAPS]

    const job = await prisma.collectionJob.create({
      data: {
        userId,
        name: `Radar · ${input.niche} · ${input.city}`,
        niche: input.niche,
        city: input.city,
        state: input.state,
        country: 'BR',
        sources,
        limitVal: input.limit ?? 100,
        status: CollectionJobStatus.PENDING,
        metadata: { origin: RADAR_JOB_ORIGIN, presetKey: presetKey(input) },
      },
      select: { id: true },
    })

    await dispatchCollectLeads( {
      jobId: job.id,
      query: input.niche,
      location: input.state ? `${input.city}, ${input.state}` : input.city,
      maxResults: input.limit ?? 100,
      sources,
      origin: RADAR_JOB_ORIGIN,
    })

    return { jobId: job.id }
  }

  /**
   * Delega validacao de quota para o QuotaEnforcer central.
   * Mantido como metodo para compatibilidade de testes existentes.
   */
  async assertQuota(userId: string): Promise<void> {
    return quotaEnforcer.assertCanCreateJob(userId)
  }

  /**
   * outreach-engine (06-10, task 25 — F-01): scheduler recorrente. Para cada
   * usuario, transforma presets em ciclos recorrentes: re-coleta presets cuja
   * ultima execucao excede a cadencia configurada (SystemConfig
   * radar.recurrence). Marcado por origin=RADAR para rastreabilidade; o
   * pipeline ja seta isNewFromRadar no create path (markAsNewFromRadar) — sem
   * regressao de dedup. Respeita quota (skip silencioso quando excedida).
   */
  async runRecurringRecollection(now: Date = new Date()): Promise<{
    enabled: boolean
    triggered: number
    skipped: number
  }> {
    const { getConfig } = await import('@/lib/services/system-config')
    const cfg = await getConfig<{ enabled?: boolean; cadenceHours?: number; maxJobsPerRun?: number }>(
      'radar.recurrence',
    )
    if (cfg.enabled !== true) return { enabled: false, triggered: 0, skipped: 0 }

    const cadenceHours = Number(cfg.cadenceHours ?? 168)
    const maxJobsPerRun = Number(cfg.maxJobsPerRun ?? 3)
    const staleBefore = new Date(now.getTime() - cadenceHours * 3600_000)

    // Presets elegiveis: ultima coleta concluida anterior ao corte de cadencia.
    const grouped = await prisma.collectionJob.groupBy({
      by: ['userId', 'city', 'state', 'niche'],
      where: { status: CollectionJobStatus.COMPLETED },
      _max: { completedAt: true },
      _sum: { resultCount: true },
    })

    const candidates = grouped
      .filter((g) => (g._sum.resultCount ?? 0) > 0)
      .filter((g) => g._max.completedAt !== null && g._max.completedAt < staleBefore)
      .sort((a, b) => (a._max.completedAt!.getTime() - b._max.completedAt!.getTime()))

    let triggered = 0
    let skipped = 0
    const perUser = new Map<string, number>()
    for (const g of candidates) {
      const count = perUser.get(g.userId) ?? 0
      if (count >= maxJobsPerRun) {
        skipped += 1
        continue
      }
      try {
        await this.recollect(g.userId, { city: g.city, state: g.state, niche: g.niche })
        perUser.set(g.userId, count + 1)
        triggered += 1
        const { track, makeCorrelationId } = await import('@/lib/telemetry')
        await track({
          kind: 'radar.recollect',
          correlationId: makeCorrelationId('radar'),
          userId: g.userId,
          resourceType: 'collection_job',
          metadata: { city: g.city, state: g.state, niche: g.niche, recurring: true },
        }).catch(() => undefined)
      } catch {
        // quota excedida / falha: skip silencioso (nao derruba o ciclo)
        skipped += 1
      }
    }
    return { enabled: true, triggered, skipped }
  }
}

export function presetKey(input: Pick<RecollectInput, 'city' | 'state' | 'niche'>): string {
  return `${(input.state ?? '').toLowerCase()}|${input.city.toLowerCase()}|${input.niche.toLowerCase()}`
}

export const radarService = new RadarService()
