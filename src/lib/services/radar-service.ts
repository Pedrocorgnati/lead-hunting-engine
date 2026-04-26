import { prisma } from '@/lib/prisma'
import { CollectionJobStatus, DataSource } from '@/lib/constants/enums'
import { tasks } from '@trigger.dev/sdk/v3'
import { quotaEnforcer, QuotaExceededError } from './quota-enforcer'

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

    await tasks.trigger('collect-leads', {
      jobId: job.id,
      query: input.niche,
      location: input.state ? `${input.city}, ${input.state}` : input.city,
      maxResults: input.limit ?? 100,
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
}

export function presetKey(input: Pick<RecollectInput, 'city' | 'state' | 'niche'>): string {
  return `${(input.state ?? '').toLowerCase()}|${input.city.toLowerCase()}|${input.niche.toLowerCase()}`
}

export const radarService = new RadarService()
