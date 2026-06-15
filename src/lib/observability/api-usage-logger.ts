import { prisma } from '@/lib/prisma'

export type ApiCallType =
  | 'search'
  | 'details'
  | 'photos'
  | 'geocode'
  | 'reverse-geocode'
  | 'social-collect'
  | 'enrichment'

export interface LogApiUsageInput {
  provider: string
  callType: ApiCallType
  creditCost?: number
  userId?: string | null
  jobId?: string | null
  metadata?: Record<string, unknown>
  // outreach-engine (06-10, task 24/F-05): colunas agregaveis de qualidade
  // por fonte (resultados retornados vs uteis) — metadata Json nao agrega via
  // groupBy. usefulCount = leads efetivamente aproveitados (nao-duplicados).
  resultCount?: number | null
  usefulCount?: number | null
}

/**
 * Registra uma chamada de API externa. Nunca bloqueia o fluxo: erros de
 * persistencia sao silenciosamente ignorados (observabilidade e best-effort).
 *
 * Usado por provider-manager.ts para cada call de busca/detalhes/fotos/geocode.
 */
export async function logApiUsage(input: LogApiUsageInput): Promise<void> {
  try {
    await prisma.apiUsageLog.create({
      data: {
        provider: input.provider,
        callType: input.callType,
        creditCost: input.creditCost ?? 1,
        userId: input.userId ?? null,
        jobId: input.jobId ?? null,
        metadata: input.metadata as never,
        resultCount: input.resultCount ?? null,
        usefulCount: input.usefulCount ?? null,
      },
    })
  } catch {
    // Nunca propaga erro de observabilidade
  }
}

/**
 * Breakdown por provider x callType no periodo fornecido.
 * Retorna array ordenado por total desc.
 */
export async function getApiUsageBreakdown(params: {
  since: Date
  until?: Date
  userId?: string
}): Promise<Array<{ provider: string; callType: string; count: number; creditTotal: number }>> {
  const until = params.until ?? new Date()
  const rows = await prisma.apiUsageLog.groupBy({
    by: ['provider', 'callType'],
    where: {
      timestamp: { gte: params.since, lte: until },
      ...(params.userId ? { userId: params.userId } : {}),
    },
    _count: { _all: true },
    _sum: { creditCost: true },
    orderBy: { _count: { provider: 'desc' } },
  })

  return rows.map((r) => ({
    provider: r.provider,
    callType: r.callType,
    count: r._count._all,
    creditTotal: r._sum.creditCost ?? 0,
  }))
}

/**
 * Breakdown por operador (userId) no periodo. Chamadas sem userId (jobs de
 * sistema) sao agregadas sob o rotulo 'sistema'. Resolve o email do operador
 * em uma segunda query (groupBy nao suporta join no Prisma).
 * Retorna array ordenado por creditTotal desc.
 */
export async function getApiUsageByOperator(params: {
  since: Date
  until?: Date
}): Promise<Array<{ userId: string | null; email: string; count: number; creditTotal: number }>> {
  const until = params.until ?? new Date()
  const rows = await prisma.apiUsageLog.groupBy({
    by: ['userId'],
    where: { timestamp: { gte: params.since, lte: until } },
    _count: { _all: true },
    _sum: { creditCost: true },
  })

  const userIds = rows.map((r) => r.userId).filter((id): id is string => Boolean(id))
  const profiles = userIds.length
    ? await prisma.userProfile.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true },
      })
    : []
  const emailById = new Map(profiles.map((p) => [p.id, p.email]))

  return rows
    .map((r) => ({
      userId: r.userId,
      email: r.userId ? (emailById.get(r.userId) ?? r.userId) : 'sistema',
      count: r._count._all,
      creditTotal: r._sum.creditCost ?? 0,
    }))
    .sort((a, b) => b.creditTotal - a.creditTotal)
}

export type ApiUsagePeriod = 'day' | 'week' | 'month'

/**
 * Limites do periodo CALENDARIO atual (inicio inclusivo, fim exclusivo) em
 * horario local do servidor. Usado pela projecao para medir a fracao decorrida.
 */
export function getCalendarPeriodBounds(
  period: ApiUsagePeriod,
  now = new Date(),
): { start: Date; end: Date } {
  const start = new Date(now)
  const end = new Date(now)
  if (period === 'day') {
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    end.setDate(end.getDate() + 1)
  } else if (period === 'week') {
    // Semana iniciando na segunda-feira (ISO).
    const dow = (start.getDay() + 6) % 7 // 0 = segunda
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - dow)
    end.setTime(start.getTime())
    end.setDate(end.getDate() + 7)
  } else {
    start.setHours(0, 0, 0, 0)
    start.setDate(1)
    end.setTime(start.getTime())
    end.setMonth(end.getMonth() + 1)
  }
  return { start, end }
}

/**
 * Projecao de uso por run-rate linear: extrapola o consumo do periodo
 * calendario atual ate o fim do periodo, com base na fracao ja decorrida.
 * elapsedFraction guardado contra divisao por zero (minimo 1e-9).
 */
export async function getApiUsageProjection(params: {
  period: ApiUsagePeriod
  now?: Date
}): Promise<{
  period: ApiUsagePeriod
  start: string
  end: string
  elapsedFraction: number
  current: { calls: number; credits: number }
  projected: { calls: number; credits: number }
  byProvider: Array<{ provider: string; currentCredits: number; projectedCredits: number }>
}> {
  const now = params.now ?? new Date()
  const { start, end } = getCalendarPeriodBounds(params.period, now)
  const totalMs = end.getTime() - start.getTime()
  const elapsedMs = Math.min(Math.max(now.getTime() - start.getTime(), 0), totalMs)
  const elapsedFraction = Math.max(elapsedMs / totalMs, 1e-9)

  const breakdown = await getApiUsageBreakdown({ since: start, until: now })
  const currentCalls = breakdown.reduce((acc, r) => acc + r.count, 0)
  const currentCredits = breakdown.reduce((acc, r) => acc + r.creditTotal, 0)

  const byProviderMap = new Map<string, number>()
  for (const r of breakdown) {
    byProviderMap.set(r.provider, (byProviderMap.get(r.provider) ?? 0) + r.creditTotal)
  }

  return {
    period: params.period,
    start: start.toISOString(),
    end: end.toISOString(),
    elapsedFraction,
    current: { calls: currentCalls, credits: currentCredits },
    projected: {
      calls: Math.round(currentCalls / elapsedFraction),
      credits: Math.round(currentCredits / elapsedFraction),
    },
    byProvider: Array.from(byProviderMap.entries())
      .map(([provider, credits]) => ({
        provider,
        currentCredits: credits,
        projectedCredits: Math.round(credits / elapsedFraction),
      }))
      .sort((a, b) => b.projectedCredits - a.projectedCredits),
  }
}
