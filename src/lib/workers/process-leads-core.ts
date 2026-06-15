import { enrichLead } from '@/lib/intelligence/enrichment/enrichment-pipeline'
import { calculateScore } from '@/lib/intelligence/scoring/scoring-engine'
import { classifyOpportunityWithConfig, type SocialSignals } from '@/lib/intelligence/classifier/opportunity-classifier'
import { loadClassificationRules } from '@/lib/intelligence/classifier/rules-loader'
import { evaluateFacebookAbandonment } from '@/lib/intelligence/heuristics/facebook-abandonment'
import { runDetailedEnrichment, isGenericEmail } from '@/lib/intelligence/enrichment/enrichers'
import {
  mergeEnrichmentData,
  mergeWhatsappEnrichment,
  readWhatsappEnrichment,
  CONTACT_DISCOVERY_STEPS,
  type ContactDiscoveryMarker,
} from '@/lib/intelligence/enrichment/enrichment-data'
import { normalizePhoneE164 } from '@/lib/workers/utils/data-normalizer'
import { computeIntegrityScore, isHotZone } from '@/lib/intelligence/quality/integrity-score'
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

/**
 * P-03: o place_id do Google fica em RawLeadData.externalId. Copia-lo para
 * Lead.placeId habilita re-enriquecimento por place_id (Place Details, reviews)
 * sem re-coletar. Apenas fontes Google tem place_id valido.
 */
function extractPlaceId(source: string, externalId: string | null): string | null {
  return source === 'GOOGLE_MAPS' && externalId ? externalId : null
}

export async function runProcessLeads(
  payload: ProcessLeadsCorePayload,
  log: ProcessLeadsLogger = consoleLogger,
): Promise<ProcessLeadsResult> {
  const prisma = getPrisma()

  // P-09: niche/city do job para persistir Lead.niche e alimentar o serpRank
  // do enriquecimento detalhado. Uma unica query por job (nao por lead).
  const jobMeta = await prisma.collectionJob
    .findUnique({ where: { id: payload.jobId }, select: { niche: true, city: true } })
    .catch(() => null)

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
          userId: payload.userId,
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

      // 4. Calcular score ponderado (fallback para pesos iguais se DB vazio).
      // P-06: passar o 2o arg `raw` — sem ele, evaluateOpportunitySignals roda
      // com raw=null e perde site-bad-or-absent/strong-ig-weak-site.
      const scoreResult = await calculateScore(enriched, {
        siteReachable: raw.siteReachable ?? null,
        siteMobileFriendly: raw.siteMobileFriendly ?? null,
        instagramFollowers: raw.instagramFollowers ?? null,
        rawJson: rawInput.rawJson,
      })

      // 5. Classificar oportunidade com as regras salvas pelo admin
      // (AD20 /admin/classificacao); tabela vazia -> defaults hardcoded.
      // P-06: montar socialSignals reais (hoje era undefined). Avalia abandono
      // de FB SOMENTE com dado SUFICIENTE — espelha stage-social.ts (followers,
      // lastPostAt OU engagement). Um facebookUrl "pelado" (sem sinal temporal/
      // engajamento) NAO basta: evaluateFacebookAbandonment retornaria
      // abandoned=true por 'no_posts' (dados ausentes != abandonado), o que
      // poderia forcar A_NEEDS_SITE indevido no override do classificador. (BUG-003)
      const socialSignals: SocialSignals = { siteReachable: raw.siteReachable ?? null }
      if (
        (raw.facebookFollowers ?? 0) > 0 ||
        raw.facebookLastPostAt != null ||
        raw.facebookEngagementRate != null
      ) {
        socialSignals.facebookAbandoned = evaluateFacebookAbandonment({
          lastPostAt: raw.facebookLastPostAt,
          followers: raw.facebookFollowers,
          engagementRate: raw.facebookEngagementRate,
        }).abandoned
      }

      const classificationRules = await loadClassificationRules()
      const opportunityType = classifyOpportunityWithConfig(
        scoreResult,
        enriched,
        socialSignals,
        classificationRules,
      )

      // 6. Criar ou atualizar Lead
      let leadId: string
      const placeId = extractPlaceId(String(raw.source), raw.externalId)

      // P-08: enriquecimento detalhado (siteAudit/serpRank/ads/reviews + techStack).
      // Popula campos lidos por /leads/[id]/competitors (hoje sempre nulos = feature
      // morta). Gated por env (custo de APIs externas + fetch extra do site);
      // cada enricher se auto-skipa sem key e runDetailedEnrichment nunca lanca.
      // Ligar com DETAILED_ENRICHMENT=on. Default OFF protege quota em coletas grandes.
      // outreach-engine (06-10, task 20/F-20): enriquecimento progressivo.
      // `on` = full sempre (legado). `hot-zone` = lite por padrao, full so
      // para leads na hot-zone (score alto / temperatura HOT / sinais fortes)
      // — reduz custo de API concentrando a pesquisa cara onde o retorno
      // esperado e maior. Default (ausente/off) = nunca roda full.
      let detailed: Awaited<ReturnType<typeof runDetailedEnrichment>> | null = null
      const detailMode = process.env.DETAILED_ENRICHMENT
      const hotZone = isHotZone({ score: scoreResult.totalScore, signals: scoreResult.signals ?? [] })
      const shouldRunFull =
        detailMode === 'on' || (detailMode === 'hot-zone' && hotZone)
      if (shouldRunFull && (enriched.website || placeId)) {
        detailed = await runDetailedEnrichment({
          website: enriched.website,
          placeId,
          niche: jobMeta?.niche ?? null,
          city: enriched.city,
          facebookPageId: null,
        }).catch(() => null)
      }

      // P-09: campos derivados ja computados/disponiveis mas antes descartados.
      // Condicionais para nao sobrescrever valores existentes com null no update.
      const emailVal = enriched.emailPrimary ?? raw.email ?? null
      // Review 06-11 R3-2: phoneNormalized com normalizador E.164 REAL no
      // fallback — enriched.phone cru passava por normalizePhone, que devolve
      // trim cru para fixos de 10 digitos (violava o contrato da coluna).
      const phoneNormalizedVal = raw.phoneNormalized ?? normalizePhoneE164(enriched.phone)
      // outreach-engine (06-10, task 19/F-19): score de integridade — gate de
      // elegibilidade de auto-outbound, persistido e consultavel.
      const integrity = computeIntegrityScore({
        email: emailVal,
        website: enriched.website,
        phoneNormalized: phoneNormalizedVal,
        placeId,
        enrichedAt: enriched.enrichedAt,
        enrichmentSources: enriched.enrichmentSources,
        emailIsGeneric: emailVal ? isGenericEmail(emailVal) : null,
      })
      const derived = {
        integrityScore: integrity.score,
        ...(emailVal ? { email: emailVal } : {}),
        ...(enriched.uxScore != null ? { uxScore: enriched.uxScore } : {}),
        ...(enriched.uxSignals != null ? { uxSignals: enriched.uxSignals as object } : {}),
        ...(jobMeta?.niche ? { niche: jobMeta.niche } : {}),
        // Feature 06-11 (criterios 2/19/20): sinais estruturados dos enrichers
        // que existiam no EnrichedLeadData mas NUNCA eram persistidos (bug
        // pre-existente — as colunas existem e a UI le). Condicional a
        // non-null para nao sobrescrever valor existente com null no update;
        // analyticsPixels vazio = "sem sinal" (HTML ausente), nao persiste.
        ...(enriched.isWhatsappChannel != null ? { isWhatsappChannel: enriched.isWhatsappChannel } : {}),
        ...(enriched.hasEcommerce != null ? { hasEcommerce: enriched.hasEcommerce } : {}),
        ...(enriched.ecommercePlatform != null ? { ecommercePlatform: enriched.ecommercePlatform } : {}),
        ...(enriched.analyticsPixels && enriched.analyticsPixels.length > 0
          ? { analyticsPixels: enriched.analyticsPixels }
          : {}),
        ...(detailed
          ? {
              siteAudit: detailed.siteAudit as object,
              googleReviews: detailed.googleReviews as object,
              serpRank: detailed.serpRank as object,
              adsStatus: detailed.adsStatus as object,
              techStack: detailed.techStack,
            }
          : {}),
      }

      // Feature 06-11 (criterio 20 + DEC-MARCADOR-DESCOBERTA): patch canonico
      // de enrichmentData aplicado SEMPRE via mergeEnrichmentData — substituir
      // o objeto inteiro destruiria chaves gravadas pelo worker de crawl.
      // Review 06-11 R3-1: `whatsapp` NAO entra no patch base — no update ele
      // passa pelo guard de nivel (mergeWhatsappEnrichment), senao um retry
      // sem siteHtml derivaria 'unknown' e destruiria o bloco 'confirmed' +
      // numero wa.me gravado pelo email-discovery-worker.
      const enrichmentDataPatch: Record<string, unknown> = {
        scores: enriched.scores,
        sources: enriched.enrichmentSources,
        enrichedAt: enriched.enrichedAt,
        contactDiscovery: {
          completedAt: new Date().toISOString(),
          steps: [CONTACT_DISCOVERY_STEPS.ENRICHMENT_PIPELINE],
          version: 1,
        } satisfies ContactDiscoveryMarker,
      }

      if (raw.leadId) {
        // Merge por cima do enrichmentData atual do lead (select minimo):
        // o worker de crawl grava chaves la e elas NAO podem ser destruidas.
        const existingLead = await prisma.lead.findUnique({
          where: { id: raw.leadId },
          select: { enrichmentData: true, phoneNormalized: true },
        })
        // R3-1: guard espelhado do worker — nivel novo so substitui quando
        // >= nivel existente; rebaixamento omite a chave (bloco previo fica).
        const prevWhatsapp = readWhatsappEnrichment(existingLead?.enrichmentData)
        const nextWhatsapp = mergeWhatsappEnrichment(prevWhatsapp, enriched.whatsapp)
        await prisma.lead.update({
          where: { id: raw.leadId },
          data: {
            score: scoreResult.totalScore,
            opportunities: [opportunityType],
            scoreBreakdown: scoreResult.breakdown as object,
            // P-06: persistir sinais granulares de oportunidade (site-bad-or-absent etc.)
            signals: scoreResult.signals ?? [],
            // P-03: nao sobrescrever placeId existente com null em fontes nao-Google
            ...(placeId ? { placeId } : {}),
            // R3-2: backfill de phoneNormalized no update — sem ele, lead com
            // phone mas phoneNormalized null nunca saia do limbo e podia ser
            // descartado pelo contactability-job tendo canal real (T-09).
            ...(existingLead?.phoneNormalized == null && phoneNormalizedVal
              ? { phoneNormalized: phoneNormalizedVal }
              : {}),
            // P-08/P-09: email/niche/uxScore/siteAudit/... (so quando ha valor)
            ...derived,
            enrichmentData: mergeEnrichmentData(existingLead?.enrichmentData ?? {}, {
              ...enrichmentDataPatch,
              ...(nextWhatsapp ? { whatsapp: nextWhatsapp } : {}),
            }) as object,
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
            phoneNormalized: phoneNormalizedVal,
            website: enriched.website,
            placeId,
            category: enriched.category,
            rating: enriched.rating,
            reviewCount: raw.reviewCount,
            status: LeadStatus.NEW,
            score: scoreResult.totalScore,
            opportunities: [opportunityType],
            scoreBreakdown: scoreResult.breakdown as object,
            // P-06: persistir sinais granulares de oportunidade
            signals: scoreResult.signals ?? [],
            // P-08/P-09: email/niche/uxScore/siteAudit/...
            ...derived,
            // Create: nao ha bloco previo de outro escritor — whatsapp entra direto.
            enrichmentData: mergeEnrichmentData({}, {
              ...enrichmentDataPatch,
              whatsapp: enriched.whatsapp,
            }) as object,
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
      // Feature 06-11 (criterio 20): numero extraido de link wa.me do HTML do
      // site tem proveniencia propria (fonte 'website', nao o provider da coleta).
      if (enriched.whatsapp.number != null) {
        provenanceEntries.push({
          leadId,
          rawLeadDataId: raw.id,
          field: 'whatsapp_number',
          source: 'website',
          confidence: 0.9,
        })
      }
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
