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
