import { enrichLead } from '@/lib/intelligence/enrichment/enrichment-pipeline'
import { calculateScore } from '@/lib/intelligence/scoring/scoring-engine'
import { classifyOpportunityWithConfig } from '@/lib/intelligence/classifier/opportunity-classifier'
import { loadClassificationRules } from '@/lib/intelligence/classifier/rules-loader'
import { ProvenanceService } from '@/lib/intelligence/provenance/provenance-service'
import { DedupEngine, type DedupResult } from '@/lib/intelligence/dedup-engine'
import { LeadStatus, EnrichmentStatus } from '@/lib/constants/enums'
import { getPrisma } from '@/lib/prisma'
import { dispatchLeadHot } from '@/lib/notifications/dispatcher'

/**
 * Core do processamento RawLeadData -> Lead (enriquecimento + scoring +
 * classificacao + dedup + provenance). Extraido do trigger task
 * `process-leads` para ser executavel SEM o runtime do trigger.dev:
 *
 *  - encadeado ao final de runCollection (collect-leads) — toda coleta
 *    materializa leads na sequencia (fix do money-path orfao, critic P0);
 *  - reprocessavel via local-queue kind 'process-leads' (drain);
 *  - continua sendo o corpo do trigger task processLeadsTask.
 */
export interface ProcessLeadsCorePayload {
  jobId: string
  userId: string
  limit?: number
}

export interface ProcessLeadsLogger {
  info: (message: string) => void | Promise<void>
  warn: (message: string) => void | Promise<void>
  error: (message: string) => void | Promise<void>
}

const consoleLogger: ProcessLeadsLogger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
}

export interface ProcessLeadsResult {
  processed: number
  duplicates: number
  errors: number
  total: number
}

export async function runProcessLeads(
  payload: ProcessLeadsCorePayload,
  log: ProcessLeadsLogger = consoleLogger,
): Promise<ProcessLeadsResult> {
  const prisma = getPrisma()

  // Buscar RawLeadData não processados do job (terminal stop: take 500)
  const rawLeads = await prisma.rawLeadData.findMany({
    where: {
      jobId: payload.jobId,
      enrichmentStatus: EnrichmentStatus.PENDING,
    },
    take: payload.limit ?? 500,
  })

  await log.info(`[process-leads] Iniciando: ${rawLeads.length} leads brutos`)

  let processed = 0
  let duplicates = 0
  let errors = 0

  for (const raw of rawLeads) {
    try {
      const candidateName = raw.businessName ?? ''

      // 1. Dedup check (graceful degradation em caso de falha)
      let dedupResult: DedupResult
      try {
        dedupResult = await DedupEngine.check({
          name: candidateName,
          address: raw.address ?? null,
          externalId: raw.externalId ?? raw.id,
        })
      } catch (err) {
        await log.warn(`DedupEngine.check falhou para raw.id=${raw.id}: ${String(err)}`)
        dedupResult = { isDuplicate: false, existingLeadId: null, similarity: 0 }
      }

      if (dedupResult.isDuplicate) {
        await prisma.rawLeadData.update({
          where: { id: raw.id },
          data: { enrichmentStatus: EnrichmentStatus.PARTIAL },
        })
        duplicates++
        continue
      }

      // 2. Montar RawLeadInput para pipeline de enriquecimento
      const rawInput = {
        externalId: raw.externalId ?? raw.id,
        name: candidateName,
        address: raw.address ?? null,
        city: raw.city ?? null,
        state: raw.state ?? null,
        phone: raw.phone ?? null,
        website: raw.website ?? null,
        category: raw.category ?? null,
        lat: raw.lat ? Number(raw.lat) : null,
        lng: raw.lng ? Number(raw.lng) : null,
        rating: raw.rating ? Number(raw.rating) : null,
        reviewCount: raw.reviewCount ?? null,
        openNow: raw.openNow ?? null,
        priceLevel: raw.priceLevel ?? null,
        siteReachable: raw.siteReachable ?? null,
        siteHasSsl: raw.siteHasSsl ?? null,
        siteMobileFriendly: raw.siteMobileFriendly ?? null,
        source: String(raw.source),
        rawJson: (raw.rawJson ?? {}) as Record<string, unknown>,
      }

      // 3. Enriquecer (Promise.all interno — nunca lança exceção)
      const enriched = await enrichLead(rawInput)

      // 4. Calcular score ponderado (fallback para pesos iguais se DB vazio)
      const scoreResult = await calculateScore(enriched)

      // 5. Classificar oportunidade com as regras salvas pelo admin
      // (AD20 /admin/classificacao); tabela vazia -> defaults hardcoded.
      const classificationRules = await loadClassificationRules()
      const opportunityType = classifyOpportunityWithConfig(
        scoreResult,
        enriched,
        undefined,
        classificationRules,
      )

      // 6. Criar ou atualizar Lead
      let leadId: string

      if (raw.leadId) {
        await prisma.lead.update({
          where: { id: raw.leadId },
          data: {
            score: scoreResult.totalScore,
            opportunities: [opportunityType],
            scoreBreakdown: scoreResult.breakdown as object,
            enrichmentData: {
              scores: enriched.scores,
              sources: enriched.enrichmentSources,
              enrichedAt: enriched.enrichedAt,
            },
          },
        })
        leadId = raw.leadId
      } else {
        const lead = await prisma.lead.create({
          data: {
            userId: payload.userId,
            jobId: payload.jobId,
            businessName: enriched.name,
            address: enriched.address,
            city: enriched.city,
            state: enriched.state,
            phone: enriched.phone,
            website: enriched.website,
            category: enriched.category,
            rating: enriched.rating,
            reviewCount: raw.reviewCount,
            status: LeadStatus.NEW,
            score: scoreResult.totalScore,
            opportunities: [opportunityType],
            scoreBreakdown: scoreResult.breakdown as object,
            enrichmentData: {
              scores: enriched.scores,
              sources: enriched.enrichmentSources,
              enrichedAt: enriched.enrichedAt,
            },
          },
          select: { id: true },
        })
        leadId = lead.id

        await prisma.rawLeadData.update({
          where: { id: raw.id },
          data: { leadId },
        })

        // TASK-11 CL-211: notificar "lead quente" quando score > 80
        await dispatchLeadHot(payload.userId, {
          id: leadId,
          businessName: enriched.name,
          score: scoreResult.totalScore,
          city: enriched.city,
        })
      }

      // 7. Registrar DataProvenance (LGPD Art.18 — não bloqueante em caso de falha)
      const provenanceEntries = ProvenanceService.buildEntries(leadId, raw.id, {
        name: candidateName,
        phone: raw.phone ?? null,
        website: raw.website ?? null,
        rating: raw.rating ? Number(raw.rating) : null,
        source: String(raw.source),
      })
      await ProvenanceService.recordBatch(provenanceEntries)

      // 8. Marcar RawLeadData como processado
      await prisma.rawLeadData.update({
        where: { id: raw.id },
        data: { enrichmentStatus: EnrichmentStatus.COMPLETE },
      })

      processed++
    } catch (err) {
      errors++
      await log.error(`Falha ao processar raw.id=${raw.id}: ${String(err)}`)
      // Não re-lança: pipeline continua para o próximo lead
    }
  }

  const result = { processed, duplicates, errors, total: rawLeads.length }
  await log.info(`[process-leads] Concluído: ${JSON.stringify(result)}`)
  return result
}
