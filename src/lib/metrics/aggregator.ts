import type { LeadStatus, DataSource } from '@prisma/client'
import { getPrisma } from '@/lib/prisma'

/**
 * Metrics aggregator (TASK-10).
 * Centraliza queries agregadas para o dashboard. Cache in-memory TTL 60s por chave.
 *
 * RLS: todas as funções recebem userId e filtram por ele em TODA query.
 *
 * Notas de schema:
 * - O campo `statusChangedAt` NÃO existe em Lead. Como fallback para avgTimeToQualify usamos
 *   `updatedAt - createdAt` para leads fora do status inicial (NEW, ENRICHMENT_PENDING, DISCARDED,
 *   FALSE_POSITIVE). É uma aproximação — registrar no audit log seria preferível.
 * - Lead não tem coluna `dataSource`. A fonte vive em DataProvenance (N:1 com Lead). Usamos a
 *   primeira provenance por lead como source representativo.
 */

export type MetricsRange = '7d' | '30d' | '90d' | 'all'

export interface CountByStatus {
  status: LeadStatus
  count: number
}

export interface LeadsPerDayPoint {
  date: string // YYYY-MM-DD
  count: number
}

export interface BySourceRow {
  source: DataSource | 'UNKNOWN'
  count: number
  conversionRate: number
  avgScore: number
}

export interface FunnelStage {
  stage: string
  count: number
}

export interface OverviewMetrics {
  range: MetricsRange
  totals: {
    total: number
    byStatus: CountByStatus[]
  }
  conversionRate: number
  avgScore: number
  avgTimeToQualifyMs: number | null
  leadsPerDay: LeadsPerDayPoint[]
}

// --------------------------------------------------------------------------
// Cache in-memory TTL 60s
// --------------------------------------------------------------------------
const CACHE_TTL_MS = 60_000
type CacheEntry<T> = { value: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>()

function cacheKey(name: string, userId: string, range: MetricsRange, extra?: string): string {
  return `${name}:${userId}:${range}${extra ? ':' + extra : ''}`
}

async function withCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) {
    return hit.value as T
  }
  const value = await loader()
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS })
  return value
}

/** Limpa o cache (útil em testes). */
export function __clearMetricsCache(): void {
  cache.clear()
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function rangeToSinceDate(range: MetricsRange): Date | null {
  if (range === 'all') return null
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function buildWhere(userId: string, range: MetricsRange): { userId: string; createdAt?: { gte: Date } } {
  const since = rangeToSinceDate(range)
  return since ? { userId, createdAt: { gte: since } } : { userId }
}

// NOTE: schema.prisma lista NEGOTIATING/DISQUALIFIED mas o Prisma Client gerado ainda não os
// expõe (o generate precisa ser re-rodado). Usamos string-literals castados via `as unknown as`
// para preservar a lista completa quando o client for regenerado.
const QUALIFIED_STATUSES = ['CONTACTED', 'NEGOTIATING', 'CONVERTED'] as unknown as LeadStatus[]
const CONVERTED_STATUSES = ['CONVERTED'] as unknown as LeadStatus[]
const ALL_STATUSES = [
  'NEW',
  'ENRICHMENT_PENDING',
  'CONTACTED',
  'NEGOTIATING',
  'CONVERTED',
  'DISCARDED',
  'DISQUALIFIED',
  'FALSE_POSITIVE',
] as unknown as LeadStatus[]

// --------------------------------------------------------------------------
// Aggregators
// --------------------------------------------------------------------------

/** Total de leads por status no range. */
export async function countByStatus(userId: string, range: MetricsRange): Promise<CountByStatus[]> {
  return withCache(cacheKey('countByStatus', userId, range), async () => {
    const prisma = getPrisma()
    const where = buildWhere(userId, range)
    const rows = await prisma.lead.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    })
    const map = new Map<LeadStatus, number>()
    for (const r of rows) map.set(r.status, r._count._all)
    return ALL_STATUSES.map((s) => ({ status: s, count: map.get(s) ?? 0 }))
  })
}

/** Taxa de conversão = CONVERTED / total. Retorna 0 quando total = 0. */
export async function conversionRate(userId: string, range: MetricsRange): Promise<number> {
  return withCache(cacheKey('conversionRate', userId, range), async () => {
    const prisma = getPrisma()
    const where = buildWhere(userId, range)
    const [total, converted] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.count({ where: { ...where, status: { in: CONVERTED_STATUSES } } }),
    ])
    if (total === 0) return 0
    return converted / total
  })
}

/** Leads novos por dia (inclusive zero-fill para dias sem leads). */
export async function leadsPerDay(userId: string, range: MetricsRange): Promise<LeadsPerDayPoint[]> {
  return withCache(cacheKey('leadsPerDay', userId, range), async () => {
    const prisma = getPrisma()
    const since = rangeToSinceDate(range)
    // Para `all`, limitamos os últimos 365 dias para não estourar memória
    const start = since ?? (() => {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - 365)
      d.setUTCHours(0, 0, 0, 0)
      return d
    })()

    const leads = await prisma.lead.findMany({
      where: { userId, createdAt: { gte: start } },
      select: { createdAt: true },
    })

    const counts = new Map<string, number>()
    for (const l of leads) {
      const key = l.createdAt.toISOString().slice(0, 10)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const points: LeadsPerDayPoint[] = []
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const cursor = new Date(start)
    while (cursor <= today) {
      const key = cursor.toISOString().slice(0, 10)
      points.push({ date: key, count: counts.get(key) ?? 0 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return points
  })
}

/** Score médio (retorna 0 quando não há leads). */
export async function avgScore(userId: string, range: MetricsRange): Promise<number> {
  return withCache(cacheKey('avgScore', userId, range), async () => {
    const prisma = getPrisma()
    const where = buildWhere(userId, range)
    const agg = await prisma.lead.aggregate({
      where,
      _avg: { score: true },
    })
    return Math.round(agg._avg.score ?? 0)
  })
}

/**
 * Tempo médio para qualificar (em ms).
 * Fallback: (updatedAt - createdAt) para leads cujo status atual é qualified.
 * Retorna null quando não houver dados.
 */
export async function avgTimeToQualify(userId: string, range: MetricsRange): Promise<number | null> {
  return withCache(cacheKey('avgTimeToQualify', userId, range), async () => {
    const prisma = getPrisma()
    const where = buildWhere(userId, range)
    const leads = await prisma.lead.findMany({
      where: { ...where, status: { in: QUALIFIED_STATUSES } },
      select: { createdAt: true, updatedAt: true, contactedAt: true },
    })
    if (leads.length === 0) return null
    let total = 0
    let n = 0
    for (const l of leads) {
      const endDate = l.contactedAt ?? l.updatedAt
      const diff = endDate.getTime() - l.createdAt.getTime()
      if (diff >= 0) {
        total += diff
        n += 1
      }
    }
    if (n === 0) return null
    return Math.round(total / n)
  })
}

/**
 * Performance por fonte. Agrupa por DataProvenance.source (primeira provenance por lead).
 * Retorna também bucket UNKNOWN para leads sem provenance.
 */
export async function byDataSource(userId: string, range: MetricsRange): Promise<BySourceRow[]> {
  return withCache(cacheKey('byDataSource', userId, range), async () => {
    const prisma = getPrisma()
    const where = buildWhere(userId, range)
    const leads = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        status: true,
        score: true,
        dataProvenance: {
          select: { source: true, collectedAt: true },
          orderBy: { collectedAt: 'asc' },
          take: 1,
        },
      },
    })

    type Bucket = { count: number; converted: number; scoreSum: number }
    const buckets = new Map<string, Bucket>()
    for (const l of leads) {
      const source = l.dataProvenance[0]?.source ?? 'UNKNOWN'
      const key = String(source)
      const b = buckets.get(key) ?? { count: 0, converted: 0, scoreSum: 0 }
      b.count += 1
      b.scoreSum += l.score
      if (CONVERTED_STATUSES.includes(l.status)) b.converted += 1
      buckets.set(key, b)
    }

    const rows: BySourceRow[] = []
    for (const [source, b] of buckets) {
      rows.push({
        source: source as BySourceRow['source'],
        count: b.count,
        conversionRate: b.count === 0 ? 0 : b.converted / b.count,
        avgScore: b.count === 0 ? 0 : Math.round(b.scoreSum / b.count),
      })
    }
    rows.sort((a, b) => b.count - a.count)
    return rows
  })
}

/**
 * Funil: discovered -> enriched -> contacted -> negotiating -> converted.
 * Cada etapa é cumulativa (lead em NEGOTIATING também passou por CONTACTED).
 */
export async function funnel(userId: string, range: MetricsRange): Promise<FunnelStage[]> {
  return withCache(cacheKey('funnel', userId, range), async () => {
    const prisma = getPrisma()
    const where = buildWhere(userId, range)
    const rows = await prisma.lead.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    })
    const byStatus = new Map<LeadStatus, number>()
    for (const r of rows) byStatus.set(r.status, r._count._all)

    const get = (s: string): number => byStatus.get(s as LeadStatus) ?? 0
    const discovered =
      get('NEW') +
      get('ENRICHMENT_PENDING') +
      get('CONTACTED') +
      get('NEGOTIATING') +
      get('CONVERTED') +
      get('DISCARDED') +
      get('DISQUALIFIED') +
      get('FALSE_POSITIVE')
    const enriched =
      get('CONTACTED') + get('NEGOTIATING') + get('CONVERTED') + get('NEW') + get('DISCARDED') + get('DISQUALIFIED')
    const contacted = get('CONTACTED') + get('NEGOTIATING') + get('CONVERTED')
    const negotiating = get('NEGOTIATING') + get('CONVERTED')
    const converted = get('CONVERTED')

    return [
      { stage: 'Descobertos', count: discovered },
      { stage: 'Enriquecidos', count: enriched },
      { stage: 'Contatados', count: contacted },
      { stage: 'Em negociação', count: negotiating },
      { stage: 'Convertidos', count: converted },
    ]
  })
}

/** Overview completo — usado pelo endpoint /metrics/overview. */
// --------------------------------------------------------------------------
// Radar usage (CL-135 / TASK-10)
// --------------------------------------------------------------------------

export interface RadarUsageRow {
  userId: string
  email: string | null
  radarJobs: number
  newLeadsFromRadar: number
}

/**
 * Ranking de uso do Radar por operador no periodo.
 * Conta jobs cuja metadata.origin === 'RADAR' e leads gerados a partir deles.
 * Retorna ordenado por radarJobs desc.
 */
export async function radarUsagePerUser(range: MetricsRange): Promise<RadarUsageRow[]> {
  return withCache(cacheKey('radarUsagePerUser', 'global', range), async () => {
    const prisma = getPrisma()
    const since = rangeToSinceDate(range)
    const whereJob: Record<string, unknown> = {
      metadata: { path: ['origin'], equals: 'RADAR' },
    }
    if (since) whereJob.createdAt = { gte: since }

    const jobRows = await prisma.collectionJob.groupBy({
      by: ['userId'],
      where: whereJob,
      _count: { _all: true },
    })

    if (jobRows.length === 0) return []

    const userIds = jobRows.map((r) => r.userId).filter(Boolean) as string[]
    const users = await prisma.userProfile.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    })
    const emailById = new Map(users.map((u) => [u.id, u.email]))

    const leadRowsRaw = await prisma.lead.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        metadata: { path: ['origin'], equals: 'RADAR' },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      _count: { _all: true },
    })
    const leadsByUser = new Map(leadRowsRaw.map((r) => [r.userId, r._count._all]))

    return jobRows
      .map((r) => ({
        userId: r.userId ?? '',
        email: emailById.get(r.userId ?? '') ?? null,
        radarJobs: r._count._all,
        newLeadsFromRadar: leadsByUser.get(r.userId ?? '') ?? 0,
      }))
      .sort((a, b) => b.radarJobs - a.radarJobs)
  })
}

export async function overview(userId: string, range: MetricsRange): Promise<OverviewMetrics> {
  const [byStatus, cr, score, ttq, perDay, total] = await Promise.all([
    countByStatus(userId, range),
    conversionRate(userId, range),
    avgScore(userId, range),
    avgTimeToQualify(userId, range),
    leadsPerDay(userId, range),
    getPrisma().lead.count({ where: buildWhere(userId, range) }),
  ])
  return {
    range,
    totals: { total, byStatus },
    conversionRate: cr,
    avgScore: score,
    avgTimeToQualifyMs: ttq,
    leadsPerDay: perDay,
  }
}
