/**
 * Contrato canonico dos blocos estruturados gravados em Lead.enrichmentData (JSON).
 * Feature: aumentar descoberta de e-mails e WhatsApp (blacksmith 06-11).
 *
 * Tres escritores precisam concordar neste shape — por isso ele vive num modulo
 * unico em vez de literais espalhados:
 *  - process-leads-core: grava `whatsapp` + `contactDiscovery` pos-enriquecimento;
 *  - email-discovery-worker: atualiza `whatsapp` (numero wa.me) e appenda passos
 *    de crawl em `contactDiscovery.steps`;
 *  - contactability-job: LE `contactDiscovery` (marcador de elegibilidade para
 *    descarte) e `whatsapp.level` (lead `probable` permanece no funil).
 *
 * Regra de nivel do sinal WhatsApp (criterio 19 do doc da feature):
 *  - 'confirmed'  SOMENTE com evidencia em HTML (link wa.me / botao detectado);
 *  - 'probable'   deriva de celular BR valido (classifyBRPhone === 'mobile');
 *  - 'unknown'    caso contrario (inclui telefone fixo, invalido ou ausente).
 *  'probable' NUNCA pode ser exibido/contado como confirmado em UI ou metrica.
 *
 * Decisao DEC-MARCADOR-DESCOBERTA (default do doc, registrada em 2026-06-11):
 * "descoberta de contato concluida" = `contactDiscovery.completedAt` presente.
 * Sem marcador, o lead NAO e elegivel para descarte automatico.
 */

export type WhatsappSignalLevel = 'confirmed' | 'probable' | 'unknown'

export interface WhatsappEnrichment {
  level: WhatsappSignalLevel
  /** Confianca 0..1 do detector de HTML (0 quando nao havia HTML). */
  confidence: number
  /** Tags de evidencia do detector (ex: 'wa.me-link', 'float-button'). */
  evidence: string[]
  /** Numero extraido de link wa.me/api.whatsapp.com, formato +<digitos>. */
  number: string | null
  /** true quando `number` difere de Lead.phone (comparacao por digitos). */
  numberDivergesFromPhone: boolean | null
  /** Origem dominante do sinal. */
  source: 'site_html' | 'phone_classifier' | null
  /** ISO timestamp da deteccao. */
  detectedAt: string
}

/** Passos canonicos de descoberta de contato (contactDiscovery.steps). */
export const CONTACT_DISCOVERY_STEPS = {
  ENRICHMENT_PIPELINE: 'enrichment_pipeline',
  CRAWL_HOME: 'site_crawl_home',
  CRAWL_CONTACT_PAGE: 'site_crawl_contato',
} as const

export interface ContactDiscoveryMarker {
  /** ISO timestamp em que a descoberta disponivel foi concluida. */
  completedAt: string
  /** Passos executados (valores de CONTACT_DISCOVERY_STEPS, sem duplicatas). */
  steps: string[]
  version: 1
}

/**
 * Le o bloco `whatsapp` de um enrichmentData arbitrario (JSON do banco).
 * Tolerante: retorna null para shapes invalidos/ausentes, nunca lanca.
 */
export function readWhatsappEnrichment(enrichmentData: unknown): WhatsappEnrichment | null {
  if (!enrichmentData || typeof enrichmentData !== 'object') return null
  const block = (enrichmentData as Record<string, unknown>).whatsapp
  if (!block || typeof block !== 'object') return null
  const w = block as Record<string, unknown>
  if (w.level !== 'confirmed' && w.level !== 'probable' && w.level !== 'unknown') return null
  return {
    level: w.level,
    confidence: typeof w.confidence === 'number' ? w.confidence : 0,
    evidence: Array.isArray(w.evidence) ? w.evidence.filter((e): e is string => typeof e === 'string') : [],
    number: typeof w.number === 'string' ? w.number : null,
    numberDivergesFromPhone: typeof w.numberDivergesFromPhone === 'boolean' ? w.numberDivergesFromPhone : null,
    source: w.source === 'site_html' || w.source === 'phone_classifier' ? w.source : null,
    detectedAt: typeof w.detectedAt === 'string' ? w.detectedAt : '',
  }
}

/**
 * Le o marcador `contactDiscovery`. Retorna null se ausente/invalido.
 * `completedAt` vazio ou nao-string = marcador invalido (lead nao elegivel
 * para descarte — fail-closed por design).
 */
export function readContactDiscovery(enrichmentData: unknown): ContactDiscoveryMarker | null {
  if (!enrichmentData || typeof enrichmentData !== 'object') return null
  const block = (enrichmentData as Record<string, unknown>).contactDiscovery
  if (!block || typeof block !== 'object') return null
  const m = block as Record<string, unknown>
  if (typeof m.completedAt !== 'string' || m.completedAt.length === 0) return null
  return {
    completedAt: m.completedAt,
    steps: Array.isArray(m.steps) ? m.steps.filter((s): s is string => typeof s === 'string') : [],
    version: 1,
  }
}

/** Ranking do nivel do sinal WhatsApp: confirmed > probable > unknown. */
const WHATSAPP_LEVEL_RANK: Record<WhatsappSignalLevel, number> = {
  unknown: 0,
  probable: 1,
  confirmed: 2,
}

/**
 * Decide o bloco `whatsapp` a persistir quando um escritor deriva um bloco
 * novo e pode existir bloco previo gravado por OUTRO escritor (contrato dos
 * 3 escritores do header). Regra — espelha o guard do email-discovery-worker
 * ("nunca rebaixa confirmed pre-existente"):
 *  - retorna null quando o nivel novo e INFERIOR ao existente; o escritor
 *    deve OMITIR `whatsapp` do patch, preservando o bloco previo intocado
 *    (ex.: re-enriquecimento sem siteHtml deriva 'unknown' e NAO pode
 *    destruir o 'confirmed' + numero wa.me gravado pelo worker de crawl);
 *  - nivel igual ou superior vence (evidencia mais fresca substitui), mas
 *    quando o bloco novo nao traz numero, herda number/numberDivergesFromPhone
 *    do previo — numero wa.me ja confirmado nao se perde por um re-crawl
 *    sem link.
 */
export function mergeWhatsappEnrichment(
  prev: WhatsappEnrichment | null,
  next: WhatsappEnrichment,
): WhatsappEnrichment | null {
  if (!prev) return next
  if (WHATSAPP_LEVEL_RANK[next.level] < WHATSAPP_LEVEL_RANK[prev.level]) return null
  if (next.number == null && prev.number != null) {
    return { ...next, number: prev.number, numberDivergesFromPhone: prev.numberDivergesFromPhone }
  }
  return next
}

/**
 * Merge raso e nao-destrutivo de enrichmentData: preserva chaves existentes
 * (scores/sources/enrichedAt/whatsapp/contactDiscovery/...) e aplica o patch
 * por cima. `contactDiscovery.steps` e unido (uniao sem duplicatas) em vez de
 * substituido, para que pipeline e worker componham passos sem se apagarem.
 *
 * IMPORTANTE: todo escritor de Lead.enrichmentData deve usar este helper —
 * substituir o objeto inteiro destroi o que o outro escritor gravou.
 */
export function mergeEnrichmentData(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}

  const out: Record<string, unknown> = { ...base, ...patch }

  const prevMarker = readContactDiscovery(base)
  const patchMarker = readContactDiscovery(patch)
  if (prevMarker && patchMarker) {
    out.contactDiscovery = {
      completedAt: patchMarker.completedAt,
      steps: [...new Set([...prevMarker.steps, ...patchMarker.steps])],
      version: 1,
    } satisfies ContactDiscoveryMarker
  }

  return out
}
