import { prisma } from '@/lib/prisma'
import { PROVIDER_CATALOG } from '@/lib/constants/provider-catalog'
import { findFallbackProvider } from '@/app/api/v1/admin/providers/[provider]/_provider-operations'

/**
 * health-status — calculo compartilhado da saude operacional dos providers.
 *
 * Fonte unica consumida por:
 *  - GET /api/v1/admin/providers/status (admin, payload completo)
 *  - GET /api/v1/health/providers (operador autenticado, lastError mascarado)
 *
 * Deriva status do estado de credencial (ApiCredential) + janela recente de
 * ApiUsageLog (latencia, erros consecutivos). Leitura pura: nunca propaga
 * excecao da resolucao de fallback — degrada para null com warning.
 */

export type ProviderStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'PAUSED'

export interface ProviderHealthItem {
  source: string
  label: string
  status: ProviderStatus
  latencyMs: number | null
  quotaRemaining: number | null
  rateLimitResetAt: string | null
  lastError: string | null
  fallbackProvider: string | null
  updatedAt: string
}

// Quantos logs recentes alimentam latencia/erro por provider.
const RECENT_LOG_WINDOW = 10
// Limiar de latencia media (ms) acima do qual o provider e considerado DEGRADED.
const DEGRADED_LATENCY_MS = 1000
// Erros consecutivos (do mais recente para tras) que caracterizam DOWN.
const DOWN_CONSECUTIVE_ERRORS = 3

const CATALOG_SOURCES = new Set(PROVIDER_CATALOG.map((p) => p.source))

/**
 * Extrai metadata.error de um registro de ApiUsageLog como string ou null.
 * metadata e Json livre; so consideramos erro quando a chave existe e nao e
 * null/undefined.
 */
function extractLogError(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && 'error' in metadata) {
    const err = (metadata as { error?: unknown }).error
    if (err === null || err === undefined) return null
    return typeof err === 'string' ? err : String(err)
  }
  return null
}

/**
 * Resolve o status do provider a partir do estado de credencial e da janela de
 * logs recentes (ordenados do mais recente para o mais antigo).
 *
 * Prioridade: PAUSED > DOWN > DEGRADED > UP.
 *  - PAUSED:   credencial inativa (ou ausente).
 *  - DOWN:     ativo E >= 3 logs consecutivos com erro na janela recente.
 *  - DEGRADED: ativo E (latencia media > 1000ms OU houve erro na janela mas o
 *              log mais recente esta limpo - recuperacao em andamento).
 *  - UP:       ativo E nenhuma das condicoes acima.
 */
export function resolveStatus(
  isActive: boolean,
  errorFlags: boolean[],
  avgLatencyMs: number | null,
): ProviderStatus {
  if (!isActive) return 'PAUSED'

  let consecutive = 0
  for (const hasError of errorFlags) {
    if (hasError) {
      consecutive += 1
      if (consecutive >= DOWN_CONSECUTIVE_ERRORS) return 'DOWN'
    } else {
      consecutive = 0
    }
  }

  const latencyDegraded = avgLatencyMs !== null && avgLatencyMs > DEGRADED_LATENCY_MS
  const recoveringFromError =
    errorFlags.some(Boolean) && errorFlags.length > 0 && errorFlags[0] === false
  if (latencyDegraded || recoveringFromError) return 'DEGRADED'

  return 'UP'
}

/**
 * Resolve o provider de fallback reutilizando findFallbackProvider() do modulo
 * de operacoes — nao duplica a FALLBACK_CHAIN. Excecao ou provider fora do
 * catalogo degrada para null + warning (nunca propaga).
 */
async function resolveFallback(source: string): Promise<string | null> {
  try {
    const fallback = await findFallbackProvider(source)
    if (fallback && CATALOG_SOURCES.has(fallback)) return fallback
    if (fallback && !CATALOG_SOURCES.has(fallback)) {
      console.warn(
        `[providers/health] fallback "${fallback}" de "${source}" fora do PROVIDER_CATALOG; retornando null`,
      )
    }
    return null
  } catch (error) {
    console.warn(`[providers/health] findFallbackProvider("${source}") falhou; retornando null`, error)
    return null
  }
}

/** Calcula a saude de todos os providers do catalogo. */
export async function computeProviderHealth(): Promise<ProviderHealthItem[]> {
  const now = new Date()

  const credentials = await prisma.apiCredential.findMany({
    select: {
      provider: true,
      isActive: true,
      usageResetAt: true,
      updatedAt: true,
    },
  })
  const credMap = new Map(credentials.map((c) => [c.provider.toUpperCase(), c]))

  return Promise.all(
    PROVIDER_CATALOG.map(async (descriptor): Promise<ProviderHealthItem> => {
      const cred = credMap.get(descriptor.source)
      const isActive = cred?.isActive ?? false

      // Janela recente de logs (mais recente primeiro). Match case-insensitive
      // pois provider e gravado com casing heterogeneo (ex: "OPENAI"/"openai").
      const logs = await prisma.apiUsageLog.findMany({
        where: { provider: { equals: descriptor.source, mode: 'insensitive' } },
        orderBy: { timestamp: 'desc' },
        take: RECENT_LOG_WINDOW,
        select: { latencyMs: true, metadata: true },
      })

      const latencies = logs
        .map((log) => log.latencyMs)
        .filter((value): value is number => value !== null && value !== undefined)
      const avgLatencyMs =
        latencies.length > 0
          ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
          : null

      const errorFlags = logs.map((log) => extractLogError(log.metadata) !== null)
      // metadata.error do log mais recente (DESC) que tenha erro na janela.
      const lastError =
        logs.map((log) => extractLogError(log.metadata)).find((value) => value !== null) ?? null

      const status = resolveStatus(isActive, errorFlags, avgLatencyMs)
      const fallbackProvider = await resolveFallback(descriptor.source)

      return {
        source: descriptor.source,
        label: descriptor.label,
        status,
        latencyMs: avgLatencyMs,
        // ApiCredential nao possui campo de limite de quota nesta fase: null (nao omitir).
        quotaRemaining: null,
        rateLimitResetAt: cred?.usageResetAt ? cred.usageResetAt.toISOString() : null,
        lastError,
        fallbackProvider,
        updatedAt: (cred?.updatedAt ?? now).toISOString(),
      }
    }),
  )
}

/**
 * Variante para operadores: mesma estrutura, mas lastError generico (string
 * crua de erro de API externa pode conter detalhe sensivel de infra).
 */
export async function computeProviderHealthForOperator(): Promise<ProviderHealthItem[]> {
  const items = await computeProviderHealth()
  return items.map((item) => ({
    ...item,
    lastError: item.lastError === null ? null : 'Falha recente no provedor',
  }))
}
