/**
 * src/lib/workers/email-discovery-worker.ts
 *
 * Worker oficial de descoberta de e-mail por crawling do site do lead —
 * promocao do experimento `scripts/backfill-lead-emails.ts` para o caminho
 * canonico (doc 06-11-aumentar-emails-lead-hunting, criterios 9-16, 18 e 21
 * de §12; Task 4 de §16; limiares T-03..T-07 de §11.1).
 *
 * Contrato operacional:
 *  - DRY-RUN por default (`apply: false`): ZERO writes — nem marcador de
 *    crawl — mas o relatorio sai completo para alimentar os gates de §11.1;
 *  - elegibilidade default (criterio 10 + extensao R3-3 do review): `email:
 *    null AND website != null AND status fora dos terminais`, com filtros
 *    opcionais por nicho, usuario e fonte de coleta (criterio 9 — via relacao
 *    rawLeadData; aceita nome do enum DataSource ou slug de provider, e valor
 *    desconhecido aborta ANTES de qualquer query). A coleta usa paginacao com
 *    cursor estavel
 *    (orderBy id) e pula leads em cooldown em memoria, garantindo progresso
 *    alem dos primeiros `limit` leads (fix starvation R3-3);
 *  - idempotencia/cooldown (criterio 12): lead cujo
 *    `enrichmentData.contactDiscovery` ja registra `site_crawl_home` com
 *    `completedAt` dentro de `recrawlCooldownDays` e pulado. Falha transitoria
 *    de fetch NAO grava marcador — a proxima execucao re-tenta naturalmente
 *    (retry entre execucoes, nao no loop);
 *  - SSRF (criterio 11): todo fetch passa por `safeFetchHtml` (protocolo,
 *    DNS, ranges bloqueados, redirects validados, timeout, content-type,
 *    tamanho maximo). URL invalida e host bloqueado/sem DNS sao classificados
 *    ANTES do fetch para o relatorio `errorsByClass`;
 *  - criterio 21: TODO HTML baixado passa por `discoverEmails` E
 *    `detectWhatsapp` no MESMO fetch (zero rede adicional para WhatsApp);
 *  - gate de dominio externo (§11/T-05): primary com `primaryDomainClass`
 *    'external' NUNCA e aplicado (rodape de agencia/plataforma nao e contato
 *    do lead); 'canonical' e 'unknown' podem aplicar;
 *  - guard de corrida no apply: `updateMany({ where: { id, email: null } })`
 *    — count 0 significa que outro escritor preencheu o e-mail primeiro; o
 *    lead conta em `skippedRace` e NENHUM outro write acontece para ele (o
 *    snapshot de enrichmentData lido no inicio do lote ficou stale).
 *
 * Atribuicao de proveniencia: o worker roda `discoverEmails` SOMENTE com o
 * HTML da pagina (sem rawJson) — assim `source: 'website'` + `sourceUrl` da
 * pagina sao sempre verdadeiros (criterio 15). Candidatos vindos do JSON do
 * provider sao responsabilidade do stage de enriquecimento (Task 2 do doc),
 * nao do crawler — proveniencia errada e pior que ausente (criterio 16).
 *
 * O client Prisma e INJETADO (testavel sem banco); o CLI
 * `scripts/run-email-discovery.ts` passa `createSeedClient()`.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { DataSource } from '@/lib/constants/enums'
import { discoverEmails } from '@/lib/intelligence/enrichment/enrichers/email-discovery'
import type { EmailDomainClass } from '@/lib/intelligence/enrichment/enrichers/email-prioritizer'
import { isGenericEmail } from '@/lib/intelligence/enrichment/enrichers/email-prioritizer'
import { detectWhatsapp } from '@/lib/intelligence/enrichment/enrichers/whatsapp-detector'
import type { WhatsappDetectorResult } from '@/lib/intelligence/enrichment/enrichers/whatsapp-detector'
import { computeIntegrityScore } from '@/lib/intelligence/quality/integrity-score'
import { ProvenanceService } from '@/lib/intelligence/provenance/provenance-service'
import type { ProvenanceEntry } from '@/lib/intelligence/provenance/provenance-service'
import { safeFetchHtml, hostIsSafe } from '@/lib/workers/utils/safe-fetch-html'
import {
  CONTACT_DISCOVERY_STEPS,
  mergeEnrichmentData,
  mergeWhatsappEnrichment,
  readContactDiscovery,
  readWhatsappEnrichment,
} from '@/lib/intelligence/enrichment/enrichment-data'
import type {
  ContactDiscoveryMarker,
  WhatsappEnrichment,
} from '@/lib/intelligence/enrichment/enrichment-data'

/**
 * Limiar T-06 (§11.1): maximo de paginas buscadas por dominio. HARD LIMIT no
 * codigo, deliberadamente NAO exposto como opcao de runtime. Hoje o worker
 * usa 2 paginas (home + /contato); o contador real por lead protege evolucao
 * futura do plano de rotas.
 */
export const MAX_PAGES_PER_DOMAIN = 4

const DEFAULT_LIMIT = 50
const DEFAULT_RECRAWL_COOLDOWN_DAYS = 7
const DAY_MS = 86_400_000
/** Score minimo de integridade para elegibilidade de outreach (mesma regra do backfill). */
const ELIGIBLE_MIN_SCORE = 60

/**
 * Review 06-11 R3-3 (starvation): teto de paginas do cursor de elegibilidade.
 * O cooldown e avaliado em memoria (o marcador vive em JSON), entao a coleta
 * pagina com cursor estavel ate juntar `limit` leads processaveis — este teto
 * e o terminal stop que impede varredura ilimitada quando a base inteira esta
 * em cooldown.
 */
const MAX_SCAN_BATCHES = 20

/**
 * Review 06-11 R3-3 (extensao do criterio 10): status terminais nunca sao
 * crawleados — custo de rede + LGPD questionavel para lead descartado,
 * convertido, desqualificado ou falso positivo.
 */
const EXCLUDED_LEAD_STATUSES = [
  'DISCARDED',
  'CONVERTED',
  'DISQUALIFIED',
  'FALSE_POSITIVE',
] as const

/**
 * Criterio 9: slugs de provider aceitos no filtro `source` alem do nome exato
 * do enum DataSource (mesma convencao do mapper do ProvenanceService). Slugs
 * iguais ao nome do enum em minusculas (ex: 'outscraper') ja sao cobertos
 * pelo lookup case-insensitive — aqui ficam apenas os que divergem.
 */
const SOURCE_SLUG_MAP: Record<string, DataSource> = {
  'google-places': DataSource.GOOGLE_MAPS,
  'outscraper': DataSource.OUTSCRAPER,
  'apify': DataSource.APIFY,
  'here-maps': DataSource.HERE_PLACES,
  'tomtom': DataSource.TOMTOM,
  'website': DataSource.WEBSITE,
}

/**
 * Resolve o filtro de fonte (criterio 9) para o enum DataSource: aceita o
 * nome do enum case-insensitive ('OUTSCRAPER', 'outscraper') ou slug comum
 * de provider ('google-places', 'here-maps'). Valor desconhecido lanca erro
 * listando os validos — o caller resolve ANTES de qualquer query, entao o
 * typo aborta a execucao sem custo de banco (fail-fast).
 */
function resolveSourceFilter(source: string): DataSource {
  const normalized = source.trim()
  const bySlug = SOURCE_SLUG_MAP[normalized.toLowerCase()]
  if (bySlug) return bySlug
  const enumKey = normalized.toUpperCase()
  if (Object.prototype.hasOwnProperty.call(DataSource, enumKey)) {
    return DataSource[enumKey as keyof typeof DataSource]
  }
  const valid = [...new Set([...Object.keys(DataSource), ...Object.keys(SOURCE_SLUG_MAP)])].join(', ')
  throw new Error(
    `[email-discovery] fonte desconhecida "${source}" — valores validos: ${valid}`,
  )
}

// Confiancas de proveniencia por classe do achado (design da feature).
const CONFIDENCE_EMAIL_CANONICAL_GENERIC = 0.9
const CONFIDENCE_EMAIL_CANONICAL_PERSONAL = 0.75
const CONFIDENCE_EMAIL_UNKNOWN_DOMAIN = 0.6
const CONFIDENCE_WHATSAPP_NUMBER = 0.9

export interface EmailDiscoveryWorkerOptions {
  /** Client Prisma injetado (CLI usa createSeedClient(); testes usam fake). */
  prisma: PrismaClient
  /** false (default) = DRY-RUN sem nenhum write; true = persiste. */
  apply?: boolean
  /** Maximo de leads do lote (default 50). */
  limit?: number
  /** Filtro opcional por nicho (Lead.niche). */
  niche?: string
  /** Filtro opcional por usuario (Lead.userId). */
  userId?: string
  /**
   * Filtro opcional por fonte de coleta (criterio 9): nome do enum DataSource
   * case-insensitive (ex: 'OUTSCRAPER') ou slug de provider (ex:
   * 'google-places'). Filtra via relacao rawLeadData; valor desconhecido
   * lanca erro listando os validos antes de qualquer query.
   */
  source?: string
  /** Cooldown de re-crawl em dias (default 7) — ver idempotencia no header. */
  recrawlCooldownDays?: number
}

/**
 * Classes de falha por lead. `safeFetchHtml` retorna null sem distinguir a
 * causa, entao o que e distinguivel e classificado ANTES (URL invalida, host
 * bloqueado/sem DNS) e o resto agrupado em `fetch_failed_or_filtered`
 * (timeout, rede, content-type nao-HTML, redirect invalido...). `unexpected`
 * cobre excecao nao prevista no processamento do lead (try/catch por lead —
 * o lote nunca aborta por causa de um lead).
 */
export interface EmailDiscoveryErrorsByClass {
  invalid_url: number
  dns_blocked_or_unresolved: number
  fetch_failed_or_filtered: number
  unexpected: number
}

/** Relatorio por execucao (criterio 13 + contadores do design da feature). */
export interface EmailDiscoveryReport {
  scanned: number
  fetched: number
  found: number
  /** Primary generico em dominio canonico (numerador de T-04). */
  foundGenericCanonical: number
  /** Primary pessoal (nao-generico) fora de dominio externo. */
  foundPersonal: number
  /** Primary em dominio externo (numerador de T-05) — nunca aplicado. */
  foundExternalDomain: number
  /** Achados aplicaveis que ficariam elegiveis (hardValid && score >= 60). */
  eligibleAfter: number
  applied: number
  /** Guard de corrida do updateMany perdeu (outro escritor preencheu antes). */
  skippedRace: number
  /** Cooldown: crawl da home concluido ha menos de recrawlCooldownDays. */
  skippedRecentlyCrawled: number
  /** Primary externo descartado pelo gate de dominio (§11). */
  skippedExternalPrimary: number
  /** Leads com evidencia de WhatsApp no HTML (detector positivo). */
  whatsappConfirmed: number
  /** Total de numeros unicos extraidos de links wa.me/api.whatsapp.com. */
  waNumbersExtracted: number
  errors: number
  errorsByClass: EmailDiscoveryErrorsByClass
  /** Tempo medio por lead em ms (limiar T-07: <= 10s). */
  avgMsPerLead: number
  /** found/scanned como fracao 0..1 (limiar T-03: >= 0.08). */
  foundRate: number
  dryRun: boolean
}

/** Linha minima do lead que o worker precisa (select do findMany). */
interface EligibleLeadRow {
  id: string
  website: string | null
  phone: string | null
  phoneNormalized: string | null
  placeId: string | null
  niche: string | null
  enrichmentData: unknown
}

/** Confianca de proveniencia do e-mail conforme classe de dominio do achado. */
function emailConfidence(domainClass: EmailDomainClass, generic: boolean): number {
  if (domainClass === 'canonical') {
    return generic ? CONFIDENCE_EMAIL_CANONICAL_GENERIC : CONFIDENCE_EMAIL_CANONICAL_PERSONAL
  }
  return CONFIDENCE_EMAIL_UNKNOWN_DOMAIN
}

/**
 * Compara numero wa.me extraido com Lead.phone por digitos, tolerando o
 * prefixo de pais 55 ausente em um dos lados (telefone local vs E.164).
 * Retorna null quando nao ha base de comparacao.
 */
function numberDivergesFromPhone(waNumber: string | null, phone: string | null | undefined): boolean | null {
  if (!waNumber || !phone) return null
  const wa = waNumber.replace(/\D/g, '')
  const ph = phone.replace(/\D/g, '')
  if (wa.length === 0 || ph.length === 0) return null
  if (wa === ph) return false
  if (wa === `55${ph}` || ph === `55${wa}`) return false
  return true
}

/**
 * Valida e normaliza a URL do website do lead (mesma normalizacao do
 * safeFetchHtml: https:// implicito quando falta esquema). Retorna null para
 * URL invalida ou protocolo fora de http/https.
 */
function parseWebsiteUrl(base: string): URL | null {
  try {
    const url = new URL(base.startsWith('http') ? base : `https://${base}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

/**
 * Review 06-11 R3-11: extrai `enrichedAt` e `sources` do enrichmentData do
 * lead (shape gravado pelo pipeline em process-leads-core: `{ enrichedAt,
 * sources }`) para o recomputo de integridade no apply. Sem isso o worker
 * recomputava computeIntegrityScore sem frescor/proveniencia e podia
 * SOBRESCREVER o score persistido pelo pipeline com ate 20 pontos a menos
 * (10 de enriquecimento recente + 10 de multi-fonte). Tolera ausencia do
 * bloco, Date e string (o JSON do banco serializa Date como ISO; quem valida
 * a data e o proprio computeIntegrityScore).
 */
function readEnrichmentFreshness(enrichmentData: unknown): {
  enrichedAt: Date | string | null
  sources: string[] | null
} {
  if (!enrichmentData || typeof enrichmentData !== 'object' || Array.isArray(enrichmentData)) {
    return { enrichedAt: null, sources: null }
  }
  const data = enrichmentData as Record<string, unknown>
  const enrichedAt =
    data.enrichedAt instanceof Date || typeof data.enrichedAt === 'string'
      ? data.enrichedAt
      : null
  const sources = Array.isArray(data.sources)
    ? data.sources.filter((s): s is string => typeof s === 'string')
    : null
  return { enrichedAt, sources }
}

/** E-mail primario encontrado em uma pagina crawleada. */
interface EmailHit {
  primary: string
  domainClass: EmailDomainClass
  /** URL da pagina que rendeu o e-mail (vai para DataProvenance.sourceUrl). */
  sourceUrl: string
}

/**
 * true quando o crawl da home foi concluido dentro da janela de cooldown
 * (criterio 12). Funcao pura — usada na coleta paginada (para o cursor poder
 * avancar alem dos leads recem-crawleados, fix R3-3) e como cinto de
 * seguranca por lead em processLead.
 */
function isInRecrawlCooldown(enrichmentData: unknown, cooldownDays: number): boolean {
  const marker = readContactDiscovery(enrichmentData)
  if (!marker || !marker.steps.includes(CONTACT_DISCOVERY_STEPS.CRAWL_HOME)) return false
  const completedMs = Date.parse(marker.completedAt)
  return !Number.isNaN(completedMs) && Date.now() - completedMs < cooldownDays * DAY_MS
}

/**
 * Executa o lote de descoberta. Nunca lanca por causa de um lead individual
 * (erro conta em `errors`/`errorsByClass` e o lote segue).
 */
export async function runEmailDiscoveryWorker(
  opts: EmailDiscoveryWorkerOptions,
): Promise<EmailDiscoveryReport> {
  const {
    prisma,
    apply = false,
    limit = DEFAULT_LIMIT,
    niche,
    userId,
    source,
    recrawlCooldownDays = DEFAULT_RECRAWL_COOLDOWN_DAYS,
  } = opts

  // Criterio 9: o filtro de fonte e resolvido ANTES de qualquer query —
  // valor desconhecido aborta aqui com a lista de validos (fail-fast).
  const sourceFilter = source !== undefined ? resolveSourceFilter(source) : null

  const report: EmailDiscoveryReport = {
    scanned: 0,
    fetched: 0,
    found: 0,
    foundGenericCanonical: 0,
    foundPersonal: 0,
    foundExternalDomain: 0,
    eligibleAfter: 0,
    applied: 0,
    skippedRace: 0,
    skippedRecentlyCrawled: 0,
    skippedExternalPrimary: 0,
    whatsappConfirmed: 0,
    waNumbersExtracted: 0,
    errors: 0,
    errorsByClass: {
      invalid_url: 0,
      dns_blocked_or_unresolved: 0,
      fetch_failed_or_filtered: 0,
      unexpected: 0,
    },
    avgMsPerLead: 0,
    foundRate: 0,
    dryRun: !apply,
  }

  const startedAt = Date.now()

  // Elegibilidade default (criterio 10 + extensao R3-3: sem status terminais)
  // + filtros opcionais. Review 06-11 R3-3 (starvation): paginacao com cursor
  // estavel (orderBy id asc) no lugar do lote unico `take: limit` — lead
  // crawleado sem achado continua casando `email: null` com marcador em
  // cooldown, entao o lote unico re-buscava SEMPRE os mesmos ~50 primeiros e
  // os leads 51+ nunca eram crawleados ate o cooldown expirar. O cooldown
  // (JSON, nao filtravel com seguranca no SQL) e avaliado em memoria e o
  // cursor segue buscando batches ate acumular `limit` leads processaveis.
  const leads: EligibleLeadRow[] = []
  let cursorId: string | null = null
  for (let batch = 0; batch < MAX_SCAN_BATCHES && leads.length < limit; batch++) {
    const page: EligibleLeadRow[] = await prisma.lead.findMany({
      where: {
        email: null,
        website: { not: null },
        status: { notIn: [...EXCLUDED_LEAD_STATUSES] },
        ...(niche ? { niche } : {}),
        ...(userId ? { userId } : {}),
        // Criterio 9: fonte de coleta filtrada via relacao — lead elegivel
        // quando QUALQUER linha bruta dele veio da fonte pedida.
        ...(sourceFilter ? { rawLeadData: { some: { source: sourceFilter } } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        website: true,
        phone: true,
        phoneNormalized: true,
        placeId: true,
        niche: true,
        enrichmentData: true,
      },
    })
    if (page.length === 0) break
    cursorId = page[page.length - 1].id
    for (const row of page) {
      if (leads.length >= limit) break
      if (isInRecrawlCooldown(row.enrichmentData, recrawlCooldownDays)) {
        // Skip na coleta permite ao cursor avancar alem dos leads recem-
        // crawleados; mantem a semantica do relatorio (cooldown conta em
        // scanned, como no lote unico antigo).
        report.scanned++
        report.skippedRecentlyCrawled++
        continue
      }
      leads.push(row)
    }
    if (page.length < limit) break
  }

  for (const lead of leads) {
    report.scanned++
    try {
      await processLead(lead)
    } catch (err) {
      report.errors++
      report.errorsByClass.unexpected++
      console.error(
        `[email-discovery] erro inesperado no lead ${lead.id}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  const elapsedMs = Date.now() - startedAt
  report.avgMsPerLead = report.scanned > 0 ? Math.round(elapsedMs / report.scanned) : 0
  report.foundRate = report.scanned > 0 ? report.found / report.scanned : 0
  return report

  /** Processa um lead: cooldown -> crawl -> classificacao -> apply opcional. */
  async function processLead(lead: EligibleLeadRow): Promise<void> {
    // Cooldown/idempotencia: home ja crawleada dentro da janela = pula.
    // (Cinto de seguranca — a coleta paginada ja filtra com o mesmo snapshot.)
    if (isInRecrawlCooldown(lead.enrichmentData, recrawlCooldownDays)) {
      report.skippedRecentlyCrawled++
      return
    }

    // Pre-classificacao do que e distinguivel antes do fetch (errorsByClass).
    const site = lead.website! // garantido pelo filtro website != null do findMany
    const base = site.replace(/\/+$/, '')
    const url = parseWebsiteUrl(base)
    if (!url) {
      report.errors++
      report.errorsByClass.invalid_url++
      return
    }
    if (!(await hostIsSafe(url.hostname))) {
      report.errors++
      report.errorsByClass.dns_blocked_or_unresolved++
      return
    }

    // Crawl com contador real por lead (hard limit T-06).
    let pagesRequested = 0
    const fetchPage = async (pageUrl: string): Promise<string | null> => {
      if (pagesRequested >= MAX_PAGES_PER_DOMAIN) return null
      pagesRequested++
      return safeFetchHtml(pageUrl)
    }

    let emailHit: EmailHit | null = null
    let waBest: WhatsappDetectorResult | null = null
    let waSourceUrl: string | null = null
    const waNumbers: string[] = []
    const stepsDone: string[] = []

    // Criterio 21: cada HTML baixado passa por discoverEmails E detectWhatsapp.
    const analysePage = (html: string, pageUrl: string, step: string): void => {
      stepsDone.push(step)
      const emailResult = discoverEmails({ html, websiteUrl: lead.website })
      const waResult = detectWhatsapp({ html, phone: lead.phone })
      if (waResult.isWhatsappChannel && (!waBest || waResult.confidence > waBest.confidence)) {
        waBest = waResult
      }
      for (const n of waResult.extractedNumbers) {
        if (!waNumbers.includes(n)) waNumbers.push(n)
      }
      if (waNumbers.length > 0 && !waSourceUrl) waSourceUrl = pageUrl
      if (!emailHit && emailResult.primary) {
        emailHit = {
          primary: emailResult.primary,
          domainClass: emailResult.primaryDomainClass,
          sourceUrl: pageUrl,
        }
      }
    }

    const homeHtml = await fetchPage(base)
    if (homeHtml) analysePage(homeHtml, base, CONTACT_DISCOVERY_STEPS.CRAWL_HOME)
    if (!emailHit) {
      const contactUrl = `${base}/contato`
      const contactHtml = await fetchPage(contactUrl)
      if (contactHtml) analysePage(contactHtml, contactUrl, CONTACT_DISCOVERY_STEPS.CRAWL_CONTACT_PAGE)
    }

    if (stepsDone.length === 0) {
      // Nenhum HTML obtido: falha transitoria ou filtrada. SEM marcador
      // gravado — a proxima execucao re-tenta naturalmente (retry entre
      // execucoes, nao no loop).
      report.errors++
      report.errorsByClass.fetch_failed_or_filtered++
      return
    }
    report.fetched++

    report.waNumbersExtracted += waNumbers.length
    if (waBest) report.whatsappConfirmed++

    // Classificacao do achado para os gates T-04/T-05.
    let applicable: EmailHit | null = null
    if (emailHit !== null) {
      const hit: EmailHit = emailHit
      report.found++
      const generic = isGenericEmail(hit.primary)
      if (hit.domainClass === 'external') {
        // Gate de dominio externo (§11): rodape de agencia/plataforma nunca
        // vira contato do lead.
        report.foundExternalDomain++
        report.skippedExternalPrimary++
        console.log(
          `[email-discovery] ${lead.id}: primary ${hit.primary} em dominio EXTERNO ao site ${lead.website} — nao aplicado`,
        )
      } else {
        if (hit.domainClass === 'canonical' && generic) report.foundGenericCanonical++
        else if (!generic) report.foundPersonal++
        applicable = hit
      }
    }

    // Integridade recomputada para o achado aplicavel (criterio 14) — tambem
    // no dry-run, para alimentar eligibleAfter no relatorio. Review 06-11
    // R3-11: frescor e fontes vem do enrichmentData ja selecionado — sem
    // eles o recomputo podia rebaixar em ate 20 pontos o score persistido
    // pelo pipeline de enriquecimento.
    let integrityScore: number | null = null
    if (applicable) {
      const freshness = readEnrichmentFreshness(lead.enrichmentData)
      const integrity = computeIntegrityScore({
        email: applicable.primary,
        website: lead.website,
        phoneNormalized: lead.phoneNormalized,
        placeId: lead.placeId,
        enrichedAt: freshness.enrichedAt,
        enrichmentSources: freshness.sources,
        emailIsGeneric: isGenericEmail(applicable.primary),
      })
      integrityScore = integrity.score
      if (integrity.hardValid && integrity.score >= ELIGIBLE_MIN_SCORE) report.eligibleAfter++
      console.log(
        `[email-discovery] ${lead.id} (${lead.niche ?? 'sem nicho'}): ${applicable.primary} ` +
          `[${applicable.domainClass}] via ${applicable.sourceUrl} → integridade ${integrity.score}`,
      )
    }

    if (!apply) return // DRY-RUN: zero writes (nem marcador)

    const nowIso = new Date().toISOString()
    const provenanceEntries: ProvenanceEntry[] = []

    // 1. E-mail com guard de corrida: so preenche se continua null no banco.
    if (applicable && integrityScore !== null) {
      const updated = await prisma.lead.updateMany({
        where: { id: lead.id, email: null },
        data: { email: applicable.primary, integrityScore },
      })
      if (updated.count === 0) {
        // Outro escritor preencheu o e-mail entre o findMany e o update; o
        // snapshot de enrichmentData ficou stale — nenhum outro write aqui.
        report.skippedRace++
        return
      }
      report.applied++
      provenanceEntries.push({
        leadId: lead.id,
        rawLeadDataId: null,
        field: 'email',
        source: 'website',
        sourceUrl: applicable.sourceUrl,
        confidence: emailConfidence(applicable.domainClass, isGenericEmail(applicable.primary)),
      })
    }

    // 2. enrichmentData read-merge-write: marcador de crawl sempre que houve
    //    pagina baixada; bloco whatsapp SOMENTE quando o crawl achou evidencia
    //    (nunca rebaixa 'confirmed' pre-existente — sem evidencia, o bloco
    //    existente fica intocado). O guard de nivel/numero e o helper
    //    compartilhado mergeWhatsappEnrichment (mesmo contrato do
    //    process-leads-core, review 06-11 R3-1).
    const prevWhatsapp = readWhatsappEnrichment(lead.enrichmentData)
    const patch: Record<string, unknown> = {
      contactDiscovery: {
        completedAt: nowIso,
        steps: stepsDone,
        version: 1,
      } satisfies ContactDiscoveryMarker,
    }
    if (waBest !== null) {
      const best: WhatsappDetectorResult = waBest
      const number = waNumbers[0] ?? null
      const candidate: WhatsappEnrichment = {
        level: 'confirmed',
        confidence: best.confidence,
        evidence: best.evidence,
        number,
        numberDivergesFromPhone: numberDivergesFromPhone(number, lead.phone),
        source: 'site_html',
        detectedAt: nowIso,
      }
      const nextWhatsapp = mergeWhatsappEnrichment(prevWhatsapp, candidate)
      if (nextWhatsapp) patch.whatsapp = nextWhatsapp
    }
    const merged = mergeEnrichmentData(lead.enrichmentData, patch)
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        enrichmentData: merged as Prisma.InputJsonValue,
        // Review 06-11 R3-4: coluna legada sincronizada com o bloco canonico
        // — sem isso um confirmado-via-crawl nao exibia badge algum na UI,
        // que ainda le Lead.isWhatsappChannel como fallback.
        ...(waBest !== null ? { isWhatsappChannel: true } : {}),
      },
    })

    // 3. Proveniencia do numero wa.me quando ele e NOVO (difere do que ja
    //    estava em enrichmentData.whatsapp.number) — criterio 20.
    const persistedNumber = waNumbers[0] ?? null
    if (persistedNumber && persistedNumber !== prevWhatsapp?.number) {
      provenanceEntries.push({
        leadId: lead.id,
        rawLeadDataId: null,
        field: 'whatsapp_number',
        source: 'website',
        sourceUrl: waSourceUrl,
        confidence: CONFIDENCE_WHATSAPP_NUMBER,
      })
    }

    if (provenanceEntries.length > 0) {
      await ProvenanceService.recordBatch(provenanceEntries)
    }
  }
}
