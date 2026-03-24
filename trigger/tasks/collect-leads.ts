import { task, logger } from '@trigger.dev/sdk/v3'
import { searchBusinesses } from '@/lib/workers/providers/provider-manager'
import { geocodeAddress } from '@/lib/workers/geo/geo-manager'
import { analyzeSite } from '@/lib/workers/providers/site-analyzer'
import { normalizeRawLead, sanitizeRawJson } from '@/lib/workers/utils/data-normalizer'
import { CollectionJobStatus, DataSource } from '@/lib/constants/enums'
import { Limits } from '@/lib/constants/limits'
import { getPrisma } from '@/lib/prisma'
import type { DataSource as DataSourceType } from '@/lib/constants/enums'

export interface CollectLeadsPayload {
  jobId: string
  query: string
  location: string
  radius?: number
  maxResults?: number
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

export const collectLeadsTask = task({
  id: 'collect-leads',
  run: async (payload: CollectLeadsPayload, { ctx }) => {
    const prisma = getPrisma()

    // 1. Carregar job para obter userId e marcar como RUNNING
    const job = await prisma.collectionJob.findUniqueOrThrow({
      where: { id: payload.jobId },
      select: { userId: true },
    })

    await prisma.collectionJob.update({
      where: { id: payload.jobId },
      data: {
        status: CollectionJobStatus.RUNNING,
        startedAt: new Date(),
        triggerId: ctx.run.id,
      },
    })

    logger.info('Job iniciado', { jobId: payload.jobId, query: payload.query, location: payload.location })

    try {
      const maxResults = Math.min(
        payload.maxResults ?? Limits.MAX_COLLECTION_SIZE,
        Limits.MAX_COLLECTION_SIZE
      )

      // 2. Buscar negócios nos providers (cascata: Google Places → Outscraper → Apify)
      const businesses = await searchBusinesses({
        query: payload.query,
        location: payload.location,
        radius: payload.radius,
        maxResults,
      })

      logger.info(`Encontrados ${businesses.length} negócios`, { count: businesses.length })

      // Atualizar totalEstimated e currentSource
      await prisma.collectionJob.update({
        where: { id: payload.jobId },
        data: {
          totalEstimated: businesses.length,
          currentSource: businesses[0]?.source ?? null,
        },
      })

      // 3. Processar cada negócio
      let processed = 0
      for (const business of businesses) {
        const normalized = normalizeRawLead({ ...business })

        // Geocoding se sem coordenadas
        let lat = normalized.lat
        let lng = normalized.lng

        if ((!lat || !lng) && normalized.address) {
          try {
            const geo = await geocodeAddress(normalized.address)
            if (geo) {
              lat = geo.lat
              lng = geo.lng
            }
          } catch {
            // Geocoding é best-effort — não bloqueia
          }
        }

        // Análise básica do site — não bloqueia a coleta
        let siteReachable: boolean | null = null
        let siteHasSsl: boolean | null = null
        let siteTitle: string | null = null
        let siteMobileFriendly: boolean | null = null

        if (normalized.website) {
          try {
            const siteData = await analyzeSite(normalized.website)
            siteReachable = siteData.reachable
            siteHasSsl = siteData.hasSsl
            siteTitle = siteData.title?.slice(0, 500) ?? null
            siteMobileFriendly = siteData.mobileFriendly
          } catch {
            logger.warn('Site analysis falhou', { website: normalized.website })
          }
        }

        // Upsert por externalId — evita duplicatas
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
            rawJson: sanitizeRawJson(normalized.rawJson),
          },
          update: {}, // Não sobrescreve se externalId já existe
        })

        processed++

        // Atualizar progresso a cada 10 leads
        if (processed % 10 === 0) {
          await prisma.collectionJob.update({
            where: { id: payload.jobId },
            data: {
              progress: Math.round((processed / businesses.length) * 100),
              resultCount: processed,
              processedLeads: processed,
            },
          })
        }
      }

      // 4. Marcar job como COMPLETED
      await prisma.collectionJob.update({
        where: { id: payload.jobId },
        data: {
          status: CollectionJobStatus.COMPLETED,
          completedAt: new Date(),
          resultCount: processed,
          processedLeads: processed,
          progress: 100,
          currentSource: null,
        },
      })

      logger.info('Job concluído', { jobId: payload.jobId, processed })
      return { success: true, processed }

    } catch (error) {
      // 5. Falha fatal: marcar job como FAILED com mensagem descritiva
      await prisma.collectionJob.update({
        where: { id: payload.jobId },
        data: {
          status: CollectionJobStatus.FAILED,
          errorMessage: (error as Error).message,
          completedAt: new Date(),
        },
      }).catch(() => {}) // silent — não oculta o erro original

      throw error
    }
  },
})
