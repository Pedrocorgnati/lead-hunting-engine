import { task, logger } from '@trigger.dev/sdk/v3'
import { searchBusinesses } from '@/lib/workers/providers/provider-manager'
import { geocodeAddress } from '@/lib/workers/geo/geo-manager'
import { analyzeSite } from '@/lib/workers/providers/site-analyzer'
import { normalizeRawLead, sanitizeRawJson } from '@/lib/workers/utils/data-normalizer'
import { CollectionJobStatus, DataSource } from '@/lib/constants/enums'
import { Limits } from '@/lib/constants/limits'
import { getPrisma } from '@/lib/prisma'
import { dispatcher as defaultDispatcher } from '@/lib/notifications/dispatcher'
import type { DispatchPayload } from '@/lib/notifications/dispatcher'
import type { Prisma } from '@prisma/client'
import type { DataSource as DataSourceType } from '@/lib/constants/enums'

export interface NotificationDispatcherLike {
  dispatch: (payload: DispatchPayload) => Promise<unknown>
}

export interface CollectLeadsPayload {
  jobId: string
  query: string
  location: string
  radius?: number
  maxResults?: number
  /**
   * ID do job parent quando este e um retry. Quando presente, o worker
   * herda os RawLeadData ja coletados pelo parent (re-atribuindo jobId)
   * antes de iniciar a busca, materializando "checkpointing para retomada"
   * prometido no BUDGET.
   */
  retriedFromId?: string
}

interface MinimalLogger {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

export interface CollectLeadsDeps {
  prisma: ReturnType<typeof getPrisma>
  searchBusinesses: typeof searchBusinesses
  geocodeAddress: typeof geocodeAddress
  analyzeSite: typeof analyzeSite
  normalizeRawLead: typeof normalizeRawLead
  sanitizeRawJson: typeof sanitizeRawJson
  logger: MinimalLogger
  triggerRunId?: string
  /**
   * Dispatcher de notificacoes. Opcional para preservar compatibilidade com
   * chamadores legados; quando ausente, runCollection usa o dispatcher real.
   * Disparos sao isolados em try/catch — falha de notificacao nunca bloqueia
   * o lifecycle do CollectionJob.
   */
  dispatcher?: NotificationDispatcherLike
}

// Mapeia o slug do provider para o enum DataSource do DB
function toDataSource(source: string): DataSourceType {
  const map: Record<string, DataSourceType> = {
    'google-places': DataSource.GOOGLE_MAPS,
    'outscraper': DataSource.OUTSCRAPER,
    'apify': DataSource.APIFY,
    'here-maps': DataSource.HERE_PLACES,
    'tomtom': DataSource.TOMTOM,
  }
  return map[source] ?? DataSource.GOOGLE_MAPS
}

export function getDefaultDeps(): Omit<CollectLeadsDeps, 'triggerRunId'> {
  return {
    prisma: getPrisma(),
    searchBusinesses,
    geocodeAddress,
    analyzeSite,
    normalizeRawLead,
    sanitizeRawJson,
    logger,
    dispatcher: defaultDispatcher,
  }
}

async function safeDispatch(
  dispatcher: NotificationDispatcherLike | undefined,
  payload: DispatchPayload,
  log: MinimalLogger,
): Promise<void> {
  if (!dispatcher) return
  try {
    await dispatcher.dispatch(payload)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn('[collect-leads] notification dispatch failed', { event: payload.event, error: msg })
  }
}

/**
 * Erro sentinela: lancado quando o worker detecta CANCELLED durante o loop.
 * NAO deve ser tratado pelo bloco catch como FAILED — e finalizacao limpa.
 */
class JobCancelledDuringRunError extends Error {
  readonly isCancellation = true
  constructor(jobId: string) {
    super(`Job ${jobId} foi cancelado durante a execucao`)
    this.name = 'JobCancelledDuringRunError'
  }
}

async function isJobCancelled(
  prisma: CollectLeadsDeps['prisma'],
  jobId: string,
): Promise<boolean> {
  const fresh = await prisma.collectionJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  })
  return fresh?.status === CollectionJobStatus.CANCELLED
}

/**
 * Pure orchestrator — testavel isoladamente sem trigger.dev runtime.
 * O envelope `task()` apenas delega para esta funcao.
 */
export async function runCollection(payload: CollectLeadsPayload, deps: CollectLeadsDeps) {
  const { prisma, logger: log, triggerRunId } = deps

  const job = await prisma.collectionJob.findUniqueOrThrow({
    where: { id: payload.jobId },
    select: { userId: true, name: true },
  })

  await prisma.collectionJob.update({
    where: { id: payload.jobId },
    data: {
      status: CollectionJobStatus.RUNNING,
      startedAt: new Date(),
      ...(triggerRunId ? { triggerId: triggerRunId } : {}),
    },
  })

  // C2: Retomada via retriedFromId — herda RawLeadData ja coletados pelo
  // job parent re-atribuindo jobId. Re-execucao da busca + upsert(externalId)
  // garante que registros pre-existentes nao sao duplicados (update: {})
  // e que processedLeads reflita o trabalho herdado desde o inicio.
  let inheritedCount = 0
  if (payload.retriedFromId) {
    const reattribution = await prisma.rawLeadData.updateMany({
      where: { jobId: payload.retriedFromId, userId: job.userId },
      data: { jobId: payload.jobId },
    })
    inheritedCount = reattribution.count
    if (inheritedCount > 0) {
      log.info('Retomada via checkpoint do parent', {
        jobId: payload.jobId,
        retriedFromId: payload.retriedFromId,
        inheritedLeads: inheritedCount,
      })
      await prisma.collectionJob.update({
        where: { id: payload.jobId },
        data: { processedLeads: inheritedCount, resultCount: inheritedCount },
      })
    }
  }

  log.info('Job iniciado', { jobId: payload.jobId, query: payload.query, location: payload.location })

  try {
    const maxResults = Math.min(
      payload.maxResults ?? Limits.MAX_COLLECTION_SIZE,
      Limits.MAX_COLLECTION_SIZE
    )

    const businesses = await deps.searchBusinesses({
      query: payload.query,
      location: payload.location,
      radius: payload.radius,
      maxResults,
    })

    log.info(`Encontrados ${businesses.length} negocios`, { count: businesses.length })

    await prisma.collectionJob.update({
      where: { id: payload.jobId },
      data: {
        totalEstimated: businesses.length + inheritedCount,
        currentSource: businesses[0]?.source ?? null,
      },
    })

    let processed = 0
    let lastSource: string | null = businesses[0]?.source ?? null

    for (const business of businesses) {
      // C1: cancelamento detectado durante o loop interrompe processamento
      // de forma limpa, sem sobrescrever status para COMPLETED no final.
      if (await isJobCancelled(prisma, payload.jobId)) {
        log.info('Cancelamento detectado durante execucao — encerrando worker', {
          jobId: payload.jobId,
          processedAteCancelamento: processed,
        })
        throw new JobCancelledDuringRunError(payload.jobId)
      }

      const normalized = deps.normalizeRawLead({ ...business })

      // Atualizar currentSource quando provider muda no meio do batch
      if (normalized.source && normalized.source !== lastSource) {
        lastSource = normalized.source
        await prisma.collectionJob.update({
          where: { id: payload.jobId },
          data: { currentSource: lastSource },
        })
      }

      let lat = normalized.lat
      let lng = normalized.lng

      if ((!lat || !lng) && normalized.address) {
        try {
          const geo = await deps.geocodeAddress(normalized.address)
          if (geo) {
            lat = geo.lat
            lng = geo.lng
          }
        } catch {
          // Geocoding e best-effort
        }
      }

      let siteReachable: boolean | null = null
      let siteHasSsl: boolean | null = null
      let siteTitle: string | null = null
      let siteMobileFriendly: boolean | null = null

      if (normalized.website) {
        try {
          const siteData = await deps.analyzeSite(normalized.website)
          siteReachable = siteData.reachable
          siteHasSsl = siteData.hasSsl
          siteTitle = siteData.title?.slice(0, 500) ?? null
          siteMobileFriendly = siteData.mobileFriendly
        } catch {
          log.warn('Site analysis falhou', { website: normalized.website })
        }
      }

      await prisma.rawLeadData.upsert({
        where: { externalId: normalized.externalId },
        create: {
          jobId: payload.jobId,
          userId: job.userId,
          externalId: normalized.externalId,
          source: toDataSource(normalized.source),
          businessName: normalized.name?.slice(0, 500) ?? null,
          address: normalized.address ?? null,
          city: normalized.city ?? null,
          state: normalized.state ?? null,
          phone: normalized.phone ?? null,
          phoneNormalized: normalized.phone ?? null,
          website: normalized.website ?? null,
          category: normalized.category ?? null,
          rating: normalized.rating ?? null,
          reviewCount: normalized.reviewCount ?? null,
          lat: lat ?? null,
          lng: lng ?? null,
          openNow: normalized.openNow ?? null,
          priceLevel: normalized.priceLevel ?? null,
          siteReachable,
          siteHasSsl,
          siteTitle,
          siteMobileFriendly,
          sourceUrl: normalized.website ?? null,
          rawJson: deps.sanitizeRawJson(normalized.rawJson) as Prisma.InputJsonValue,
        },
        update: {},
      })

      processed++

      if (processed % 10 === 0) {
        const totalSoFar = inheritedCount + processed
        await prisma.collectionJob.update({
          where: { id: payload.jobId },
          data: {
            progress: Math.round((totalSoFar / (businesses.length + inheritedCount)) * 100),
            resultCount: totalSoFar,
            processedLeads: totalSoFar,
          },
        })
      }
    }

    // C1: update final condicional. updateMany com filtro status=RUNNING
    // garante no-op se outro processo (ex: cancel endpoint) ja transicionou
    // o job para CANCELLED — eliminando race CANCELLED→COMPLETED.
    const finalProcessed = inheritedCount + processed
    const transition = await prisma.collectionJob.updateMany({
      where: { id: payload.jobId, status: CollectionJobStatus.RUNNING },
      data: {
        status: CollectionJobStatus.COMPLETED,
        completedAt: new Date(),
        resultCount: finalProcessed,
        processedLeads: finalProcessed,
        progress: 100,
        currentSource: null,
      },
    })

    if (transition.count === 0) {
      // Job foi cancelado entre a ultima checagem e este update — finalizacao limpa.
      log.info('Job concluido sem transicao para COMPLETED (cancelado externamente)', {
        jobId: payload.jobId,
        processed: finalProcessed,
      })
      return { success: false, cancelled: true, processed: finalProcessed }
    }

    log.info('Job concluido', { jobId: payload.jobId, processed: finalProcessed })

    await safeDispatch(deps.dispatcher, {
      event: 'JOB_COMPLETED',
      userId: job.userId,
      params: {
        jobName: job.name ?? 'Coleta',
        jobId: payload.jobId,
        count: finalProcessed,
      },
    }, log)

    return { success: true, processed: finalProcessed }
  } catch (error) {
    // C1: cancelamento detectado durante a execucao nao deve transicionar
    // para FAILED nem disparar JOB_FAILED — e finalizacao limpa.
    if (error instanceof JobCancelledDuringRunError) {
      log.info('Worker encerrado por cancelamento — sem transicao FAILED', {
        jobId: payload.jobId,
      })
      return { success: false, cancelled: true }
    }

    const errorMessage = (error as Error).message
    // updateMany com filtro de status para nao sobrescrever CANCELLED.
    await prisma.collectionJob.updateMany({
      where: { id: payload.jobId, status: CollectionJobStatus.RUNNING },
      data: {
        status: CollectionJobStatus.FAILED,
        errorMessage,
        completedAt: new Date(),
      },
    }).catch(() => {})

    await safeDispatch(deps.dispatcher, {
      event: 'JOB_FAILED',
      userId: job.userId,
      params: {
        jobName: job.name ?? 'Coleta',
        jobId: payload.jobId,
        reason: errorMessage,
      },
    }, log)

    throw error
  }
}

export const collectLeadsTask = task({
  id: 'collect-leads',
  run: async (payload: CollectLeadsPayload, { ctx }) => {
    return runCollection(payload, {
      ...getDefaultDeps(),
      triggerRunId: ctx.run.id,
    })
  },
})
