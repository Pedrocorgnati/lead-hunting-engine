import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { CollectionJobStatus, DataSource } from '@/lib/constants/enums'
import { validateReauthSession } from '@/lib/security/reauth-challenge-store'
import { PROVIDER_CATALOG } from '@/lib/constants/provider-catalog'

const CATALOG_SOURCES = new Set(PROVIDER_CATALOG.map((p) => p.source))

export type ProviderOperation = 'pause' | 'resume' | 'force-fallback'

const OperationSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  reauthId: z.string().trim().min(1).max(160),
  correlationId: z.string().trim().min(1).max(120).optional(),
})

const PROVIDER_SLUG_MAP: Record<string, string> = {
  'google-places': 'GOOGLE_PLACES',
  'google_maps': 'GOOGLE_PLACES',
  'outscraper': 'OUTSCRAPER',
  'apify': 'APIFY',
  'here-maps': 'HERE_MAPS',
  'here_places': 'HERE_MAPS',
  'tomtom': 'TOMTOM',
  'instagram-graph': 'INSTAGRAM_GRAPH',
  'instagram_graph': 'INSTAGRAM_GRAPH',
  'instagram-apify': 'INSTAGRAM_APIFY',
  'instagram_apify': 'INSTAGRAM_APIFY',
  'facebook-graph': 'FACEBOOK_GRAPH',
  'facebook_graph': 'FACEBOOK_GRAPH',
  'facebook-intermediary': 'FACEBOOK_INTERMEDIARY',
  'facebook_intermediary': 'FACEBOOK_INTERMEDIARY',
  'linkedin-company': 'LINKEDIN_COMPANY',
  'linkedin_company': 'LINKEDIN_COMPANY',
  'apontador': 'APONTADOR',
  'guia-mais': 'GUIA_MAIS',
  'guia_mais': 'GUIA_MAIS',
  'guiamais': 'GUIA_MAIS',
  'kimi': 'KIMI',
  'moonshot': 'KIMI',
  'openai': 'OPENAI',
  'anthropic': 'ANTHROPIC',
}

const PROVIDER_TO_DATA_SOURCES: Record<string, DataSource[]> = {
  GOOGLE_PLACES: [DataSource.GOOGLE_MAPS],
  OUTSCRAPER: [DataSource.OUTSCRAPER],
  APIFY: [DataSource.APIFY],
  HERE_MAPS: [DataSource.HERE_PLACES],
  TOMTOM: [DataSource.TOMTOM],
  INSTAGRAM_GRAPH: [DataSource.INSTAGRAM],
  INSTAGRAM_APIFY: [DataSource.INSTAGRAM],
  FACEBOOK_GRAPH: [DataSource.FACEBOOK],
  FACEBOOK_INTERMEDIARY: [DataSource.FACEBOOK],
  LINKEDIN_COMPANY: [DataSource.LINKEDIN_COMPANY],
  // H-09: faltavam — pause/resume reportava impacto zero (sourceFilter {}).
  APONTADOR: [DataSource.APONTADOR],
  GUIA_MAIS: [DataSource.GUIA_MAIS],
  // LLMs nao tem jobs de coleta (geram pitch) — mapeiam para [] por design.
  KIMI: [],
  OPENAI: [],
  ANTHROPIC: [],
}

const FALLBACK_CHAIN: Record<string, string[]> = {
  GOOGLE_PLACES: ['OUTSCRAPER', 'APIFY'],
  OUTSCRAPER: ['APIFY', 'GOOGLE_PLACES'],
  APIFY: ['OUTSCRAPER', 'GOOGLE_PLACES'],
  INSTAGRAM_GRAPH: ['INSTAGRAM_APIFY', 'APIFY'],
  INSTAGRAM_APIFY: ['INSTAGRAM_GRAPH', 'APIFY'],
  FACEBOOK_GRAPH: ['FACEBOOK_INTERMEDIARY', 'APIFY'],
  FACEBOOK_INTERMEDIARY: ['FACEBOOK_GRAPH', 'APIFY'],
  HERE_MAPS: ['TOMTOM', 'GOOGLE_PLACES'],
  TOMTOM: ['HERE_MAPS', 'GOOGLE_PLACES'],
  LINKEDIN_COMPANY: ['APIFY'],
  // H-09: headless BR fazem fallback entre si e para Apify.
  APONTADOR: ['GUIA_MAIS', 'APIFY'],
  GUIA_MAIS: ['APONTADOR', 'APIFY'],
  KIMI: ['OPENAI', 'ANTHROPIC'],
  OPENAI: ['KIMI', 'ANTHROPIC'],
  ANTHROPIC: ['KIMI', 'OPENAI'],
}

function normalizeProvider(input: string): string {
  const normalized = input.trim().toLowerCase()
  return PROVIDER_SLUG_MAP[normalized] ?? normalized.toUpperCase().replace(/-/g, '_')
}

function getIp(request: NextRequest): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined
}

function buildError(code: string, message: string, httpStatus: number, details?: unknown) {
  return Object.assign(new Error(message), { code, httpStatus, details })
}

async function readBody(request: NextRequest) {
  return OperationSchema.parse(await request.json().catch(() => ({})))
}

// Exportado para reuso por GET /api/v1/admin/providers/status (A15.2) - nao duplicar a FALLBACK_CHAIN.
export async function findFallbackProvider(provider: string): Promise<string | null> {
  const candidates = FALLBACK_CHAIN[provider] ?? []
  if (candidates.length === 0) return null

  const credentials = await prisma.apiCredential.findMany({
    where: { provider: { in: candidates }, isActive: true },
    select: { provider: true },
  })
  const active = new Set(credentials.map((credential) => credential.provider))
  return candidates.find((candidate) => active.has(candidate)) ?? candidates[0] ?? null
}

async function collectImpact(provider: string) {
  const sources = PROVIDER_TO_DATA_SOURCES[provider] ?? []
  const sourceFilter = sources.length > 0 ? { sources: { hasSome: sources } } : {}
  const [activeJobs, pausedJobs, latestFailedJob] = await Promise.all([
    prisma.collectionJob.count({
      where: {
        ...sourceFilter,
        status: { in: [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING] },
      },
    }),
    prisma.collectionJob.count({
      where: {
        ...sourceFilter,
        status: CollectionJobStatus.PAUSED,
      },
    }),
    prisma.collectionJob.findFirst({
      where: {
        ...sourceFilter,
        status: { in: [CollectionJobStatus.FAILED, CollectionJobStatus.PARTIAL] },
        errorMessage: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      select: { errorMessage: true },
    }),
  ])

  return {
    collections: {
      affectedSources: sources,
      pausedOnProviderPause: activeJobs,
      fallbackAvailable: (FALLBACK_CHAIN[provider] ?? []).length > 0,
    },
    jobs: {
      active: activeJobs,
      paused: pausedJobs,
    },
    exports: {
      affected: 0,
      note: 'Exports existentes nao dependem de chamadas ao provider em tempo real.',
    },
    lastError: latestFailedJob?.errorMessage ?? null,
  }
}

function buildProviderPayload(input: {
  provider: string
  operation: ProviderOperation
  isActive: boolean
  usageCount: number
  usageResetAt: Date | null
  updatedAt: Date
  latencyMs: number
  fallbackProvider: string | null
  lastError: string | null
  impact: Awaited<ReturnType<typeof collectImpact>>
  correlationId: string
}) {
  const quotaLimit = 1000
  const quotaRemaining = Math.max(0, quotaLimit - input.usageCount)

  return {
    provider: input.provider,
    operation: input.operation,
    status: input.isActive ? 'active' : input.operation === 'force-fallback' ? 'fallback_forced' : 'paused',
    latencyMs: input.latencyMs,
    quotaRemaining,
    rateLimitResetAt: input.usageResetAt,
    lastError: input.lastError,
    fallbackProvider: input.fallbackProvider,
    updatedAt: input.updatedAt,
    impact: input.impact,
    correlationId: input.correlationId,
  }
}

export async function executeProviderOperation(
  request: NextRequest,
  providerParam: string,
  operation: ProviderOperation,
) {
  const startedAt = Date.now()

  try {
    const admin = await requireAdmin()
    const provider = normalizeProvider(providerParam)
    // H-08: whitelist contra o catalogo (defense-in-depth) — 400 explicito em vez
    // de normalizar input arbitrario e so falhar tarde no findUnique (404).
    if (!CATALOG_SOURCES.has(provider)) {
      throw buildError('INVALID_PROVIDER', `Provider desconhecido: ${providerParam}`, 400)
    }
    const body = await readBody(request)
    const correlationId = body.correlationId ?? crypto.randomUUID()
    const reauth = validateReauthSession({
      reauthId: body.reauthId,
      userId: admin.id,
      scope: `admin.providers:${provider}:${operation}`,
    })

    if (!reauth.ok) {
      throw buildError('AUTH_REAUTH_REQUIRED', 'Reautenticacao obrigatoria para operar providers.', 401, {
        reason: reauth.reason,
        scope: `admin.providers:${provider}:${operation}`,
      })
    }

    const existing = await prisma.apiCredential.findUnique({
      where: { provider },
      select: {
        id: true,
        provider: true,
        isActive: true,
        usageCount: true,
        usageResetAt: true,
        updatedAt: true,
      },
    })

    if (!existing) {
      throw buildError('PROVIDER_NOT_FOUND', 'Provider nao encontrado ou sem credencial cadastrada.', 404, {
        provider,
      })
    }

    const isActive = operation === 'resume'
    const updated = await prisma.apiCredential.update({
      where: { id: existing.id },
      data: { isActive },
      select: {
        id: true,
        provider: true,
        isActive: true,
        usageCount: true,
        usageResetAt: true,
        updatedAt: true,
      },
    })

    const fallbackProvider = operation === 'resume' ? null : await findFallbackProvider(provider)
    const impact = await collectImpact(provider)

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: `admin.provider.${operation}`,
        resource: 'api_credentials',
        resourceId: updated.id,
        metadata: {
          provider,
          reason: body.reason,
          correlationId,
          previousStatus: existing.isActive ? 'active' : 'paused',
          nextStatus: updated.isActive ? 'active' : operation === 'force-fallback' ? 'fallback_forced' : 'paused',
          fallbackProvider,
          impact,
        },
        ipAddress: getIp(request),
      },
    })

    return successResponse(
      buildProviderPayload({
        provider,
        operation,
        isActive: updated.isActive,
        usageCount: updated.usageCount,
        usageResetAt: updated.usageResetAt,
        updatedAt: updated.updatedAt,
        latencyMs: Date.now() - startedAt,
        fallbackProvider,
        lastError: impact.lastError,
        impact,
        correlationId,
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
