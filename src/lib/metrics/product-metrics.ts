import { getPrisma } from '@/lib/prisma'

/**
 * Product SLA metrics (TASK-5 / CL-174..CL-177).
 *
 * Observam:
 * - CL-174 Leads por coleta (avg resultCount em jobs COMPLETED)
 * - CL-175 Taxa de FP (count(FALSE_POSITIVE) / total)
 * - CL-176 Tempo de coleta (avg completedAt - startedAt, em min)
 * - CL-177 Cobertura de enriquecimento (leads com >= 3 provenances / total)
 *
 * Janela default: 30 dias. RLS: todas as funcoes recebem userId e filtram.
 * Retorno = numero puro OU null quando nao ha amostra suficiente.
 */

const DEFAULT_WINDOW_DAYS = 30
const MIN_SAMPLE_JOBS = 5
const MIN_SAMPLE_LEADS = 5
const MIN_PROVENANCES_FOR_COVERAGE = 3

export interface ProductMetricsWindow {
  windowDays?: number
}

function sinceDate(days: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/** Media de leads por coleta concluida (COMPLETED) na janela. null se amostra < MIN_SAMPLE_JOBS. */
export async function getLeadsPerJob(
  userId: string,
  { windowDays = DEFAULT_WINDOW_DAYS }: ProductMetricsWindow = {},
): Promise<number | null> {
  const prisma = getPrisma()
  const since = sinceDate(windowDays)
  const agg = await prisma.collectionJob.aggregate({
    where: { userId, status: 'COMPLETED', completedAt: { gte: since } },
    _avg: { resultCount: true },
    _count: { _all: true },
  })
  if ((agg._count?._all ?? 0) < MIN_SAMPLE_JOBS) return null
  const avg = agg._avg?.resultCount ?? 0
  return Math.round(avg * 10) / 10
}

/** Taxa de falso-positivo na janela. Retorna fracao [0, 1]. null se amostra < MIN_SAMPLE_LEADS. */
export async function getFalsePositiveRate(
  userId: string,
  { windowDays = DEFAULT_WINDOW_DAYS }: ProductMetricsWindow = {},
): Promise<number | null> {
  const prisma = getPrisma()
  const since = sinceDate(windowDays)
  const [total, fp] = await Promise.all([
    prisma.lead.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.lead.count({
      where: { userId, createdAt: { gte: since }, status: 'FALSE_POSITIVE' },
    }),
  ])
  if (total < MIN_SAMPLE_LEADS) return null
  return fp / total
}

/** Tempo medio de coleta em minutos (jobs COMPLETED com startedAt/completedAt). null se amostra < MIN_SAMPLE_JOBS. */
export async function getAvgCollectionTime(
  userId: string,
  { windowDays = DEFAULT_WINDOW_DAYS }: ProductMetricsWindow = {},
): Promise<number | null> {
  const prisma = getPrisma()
  const since = sinceDate(windowDays)
  const jobs = await prisma.collectionJob.findMany({
    where: {
      userId,
      status: 'COMPLETED',
      completedAt: { gte: since, not: null },
      startedAt: { not: null },
    },
    select: { startedAt: true, completedAt: true },
  })
  if (jobs.length < MIN_SAMPLE_JOBS) return null
  let totalMs = 0
  let n = 0
  for (const j of jobs) {
    if (!j.startedAt || !j.completedAt) continue
    const diff = j.completedAt.getTime() - j.startedAt.getTime()
    if (diff > 0) {
      totalMs += diff
      n += 1
    }
  }
  if (n === 0) return null
  const avgMinutes = totalMs / n / 60_000
  return Math.round(avgMinutes * 10) / 10
}

/** Cobertura de enriquecimento: leads com >=3 provenances / total. null se amostra < MIN_SAMPLE_LEADS. */
export async function getEnrichmentCoverage(
  userId: string,
  { windowDays = DEFAULT_WINDOW_DAYS }: ProductMetricsWindow = {},
): Promise<number | null> {
  const prisma = getPrisma()
  const since = sinceDate(windowDays)
  const leads = await prisma.lead.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { id: true, _count: { select: { dataProvenance: true } } },
  })
  if (leads.length < MIN_SAMPLE_LEADS) return null
  const covered = leads.filter((l) => l._count.dataProvenance >= MIN_PROVENANCES_FOR_COVERAGE).length
  return covered / leads.length
}

export interface ProductMetricStatus {
  value: number | null
  target: string
  status: 'OK' | 'ALERTA' | 'SEM_DADOS'
  unit?: string
}

export interface ProductMetricsPayload {
  windowDays: number
  minSampleJobs: number
  minSampleLeads: number
  leadsPerJob: ProductMetricStatus
  fpRate: ProductMetricStatus
  avgCollectionTimeMin: ProductMetricStatus
  enrichmentCoverage: ProductMetricStatus
  /** TASK-25/ST003 (CL-108): operadores ativos em janelas d1/d7/d30 (global, nao por userId). */
  activeOperators: ActiveOperatorsSummary
}

export interface ActiveOperatorsSummary {
  d1: number
  d7: number
  d30: number
}

function classifyLeadsPerJob(v: number | null): ProductMetricStatus {
  if (v === null) return { value: null, target: '30-100', status: 'SEM_DADOS' }
  return { value: v, target: '30-100', status: v >= 30 && v <= 100 ? 'OK' : 'ALERTA' }
}

function classifyFpRate(v: number | null): ProductMetricStatus {
  if (v === null) return { value: null, target: '< 20%', status: 'SEM_DADOS', unit: '%' }
  return { value: v, target: '< 20%', status: v < 0.2 ? 'OK' : 'ALERTA', unit: '%' }
}

function classifyAvgTime(v: number | null): ProductMetricStatus {
  if (v === null) return { value: null, target: '< 5 min', status: 'SEM_DADOS', unit: 'min' }
  return { value: v, target: '< 5 min', status: v < 5 ? 'OK' : 'ALERTA', unit: 'min' }
}

function classifyCoverage(v: number | null): ProductMetricStatus {
  if (v === null) return { value: null, target: '>= 60%', status: 'SEM_DADOS', unit: '%' }
  return { value: v, target: '>= 60%', status: v >= 0.6 ? 'OK' : 'ALERTA', unit: '%' }
}

/**
 * TASK-25/ST003 (CL-108): operadores ativos por janela.
 * Proxy: "operador ativo" = userId com >=1 AuditLog na janela.
 * Nao inclui ADMINs apenas — conta qualquer role com atividade registrada.
 */
export async function getActiveOperators(): Promise<ActiveOperatorsSummary> {
  const prisma = getPrisma()
  const now = Date.now()
  const d1 = new Date(now - 86_400_000)
  const d7 = new Date(now - 7 * 86_400_000)
  const d30 = new Date(now - 30 * 86_400_000)

  async function countDistinct(since: Date): Promise<number> {
    const rows = await prisma.auditLog.findMany({
      where: { createdAt: { gte: since }, userId: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    })
    return rows.length
  }

  const [c1, c7, c30] = await Promise.all([
    countDistinct(d1),
    countDistinct(d7),
    countDistinct(d30),
  ])
  return { d1: c1, d7: c7, d30: c30 }
}

export async function getProductMetrics(
  userId: string,
  { windowDays = DEFAULT_WINDOW_DAYS }: ProductMetricsWindow = {},
): Promise<ProductMetricsPayload> {
  const [leadsPerJob, fpRate, avgTime, coverage, activeOperators] = await Promise.all([
    getLeadsPerJob(userId, { windowDays }),
    getFalsePositiveRate(userId, { windowDays }),
    getAvgCollectionTime(userId, { windowDays }),
    getEnrichmentCoverage(userId, { windowDays }),
    getActiveOperators(),
  ])
  return {
    windowDays,
    minSampleJobs: MIN_SAMPLE_JOBS,
    minSampleLeads: MIN_SAMPLE_LEADS,
    leadsPerJob: classifyLeadsPerJob(leadsPerJob),
    fpRate: classifyFpRate(fpRate),
    avgCollectionTimeMin: classifyAvgTime(avgTime),
    enrichmentCoverage: classifyCoverage(coverage),
    activeOperators,
  }
}
