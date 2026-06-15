import { stageWebsitePresence } from './stage-website'
import { stageSocialPresence } from './stage-social'
import { stageReviewsRating } from './stage-reviews'
import { stageLocationAccess } from './stage-location'
import { stageBusinessMaturity } from './stage-maturity'
import { stageDigitalGap } from './stage-digital-gap'
import { detectWhatsapp, type WhatsappDetectorResult } from './enrichers/whatsapp-detector'
import { classifyBRPhone } from './enrichers/phone-classifier'
import { detectEcommerce } from './enrichers/ecommerce-detector'
import { detectAnalyticsPixels } from './enrichers/analytics-pixels-detector'
import type { EnrichedLeadData } from './types'
import type { WhatsappEnrichment } from './enrichment-data'
import type { RawLeadInput } from '@/lib/workers/utils/data-normalizer'

function extractSiteHtml(raw: RawLeadInput): string | null {
  const rj = (raw.rawJson ?? {}) as Record<string, unknown>
  if (typeof rj.siteHtml === 'string') return rj.siteHtml
  if (typeof rj.html === 'string') return rj.html
  return null
}

/** Apenas os digitos do telefone, para comparacao tolerante a formatacao. */
function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '')
}

/**
 * Compara o numero extraido de wa.me com Lead.phone POR DIGITOS, tolerando
 * codigo do pais/zero de tronco: '+5511999998888' e '(11) 99999-8888' sao o
 * MESMO numero (um e sufixo do outro com >= 8 digitos). Retorna null quando
 * number ou phone ausente — sem dado nao ha como afirmar divergencia.
 */
function numberDivergesFromPhone(number: string | null, phone: string | null | undefined): boolean | null {
  const a = phoneDigits(number)
  const b = phoneDigits(phone)
  if (!a || !b) return null
  if (a === b) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (shorter.length >= 8 && longer.endsWith(shorter)) return false
  return true
}

/**
 * Deriva o bloco canonico `whatsapp` (enrichment-data.ts) a partir do detector
 * de HTML + classificador de telefone BR. Regra de nivel (criterio 19 do doc):
 *  - 'confirmed' SOMENTE com siteHtml E evidencia do detector;
 *  - 'probable'  quando o telefone do lead e celular BR valido;
 *  - 'unknown'   caso contrario (fixo, invalido, ausente) — fail-closed.
 * 'probable' NUNCA seta o boolean legado isWhatsappChannel.
 */
function deriveWhatsappEnrichment(
  detector: WhatsappDetectorResult,
  siteHtml: string | null,
  phone: string | null | undefined,
): WhatsappEnrichment {
  const confirmed = siteHtml !== null && detector.isWhatsappChannel
  const phoneClass = classifyBRPhone(phone)
  const level = confirmed ? 'confirmed' : phoneClass === 'mobile' ? 'probable' : 'unknown'
  const number = detector.extractedNumbers[0] ?? null
  return {
    level,
    confidence: detector.confidence,
    evidence: detector.evidence,
    number,
    numberDivergesFromPhone: numberDivergesFromPhone(number, phone),
    source: level === 'confirmed' ? 'site_html' : level === 'probable' ? 'phone_classifier' : null,
    detectedAt: new Date().toISOString(),
  }
}

/**
 * Executa os 6 estagios de enriquecimento + 3 enrichers de sinais
 * estruturados (TASK-3 intake-review: whatsapp, ecommerce, analytics-pixels)
 * em paralelo. Cada estagio retorna score 0-100 + metadata.
 * Nunca lanca excecao.
 */
export async function enrichLead(raw: RawLeadInput): Promise<EnrichedLeadData> {
  const siteHtml = extractSiteHtml(raw)

  const [website, social, reviews, location, maturity, digitalGap] = await Promise.all([
    stageWebsitePresence(raw),
    stageSocialPresence(raw),
    stageReviewsRating(raw),
    stageLocationAccess(raw),
    stageBusinessMaturity(raw),
    stageDigitalGap(raw),
  ])

  // TASK-3 intake-review: enrichers puros (sincronos) sobre o HTML capturado
  const whatsapp = detectWhatsapp({ html: siteHtml, phone: raw.phone ?? null })
  const ecommerce = detectEcommerce({ html: siteHtml, url: raw.website ?? null })
  const pixels = detectAnalyticsPixels({ html: siteHtml })

  const enrichmentSources = [...new Set([
    ...website.sources,
    ...social.sources,
    ...reviews.sources,
    ...location.sources,
    ...maturity.sources,
    ...digitalGap.sources,
  ])]

  // P-09: campos derivados ja calculados no stage-website (discoverEmails +
  // analyzeUx) ficavam so no metadata e eram descartados. Expor para persistencia.
  const wmeta = website.metadata ?? {}
  const emailPrimary = typeof wmeta.emailPrimary === 'string' ? wmeta.emailPrimary : null
  const uxScore = typeof wmeta.uxScore === 'number' ? wmeta.uxScore : null
  const uxSignals = wmeta.uxSignals ?? null

  return {
    name: raw.name,
    address: raw.address ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    phone: raw.phone ?? null,
    website: raw.website ?? null,
    category: raw.category ?? null,
    lat: raw.lat ?? null,
    lng: raw.lng ?? null,
    rating: raw.rating ?? null,
    emailPrimary,
    uxScore,
    uxSignals,
    scores: {
      websitePresence: website.score,
      socialPresence: social.score,
      reviewsRating: reviews.score,
      locationAccess: location.score,
      businessMaturity: maturity.score,
      digitalGap: digitalGap.score,
    },
    isWhatsappChannel: siteHtml ? whatsapp.isWhatsappChannel : null,
    // Feature 06-11 (criterio 19): bloco canonico com nivel — 'probable' via
    // celular BR NAO altera o boolean legado acima (sem HTML ele segue null).
    whatsapp: deriveWhatsappEnrichment(whatsapp, siteHtml, raw.phone ?? null),
    hasEcommerce: siteHtml ? ecommerce.hasEcommerce : null,
    ecommercePlatform: ecommerce.platform ?? null,
    analyticsPixels: pixels.analyticsPixels,
    enrichmentSources,
    enrichedAt: new Date(),
  }
}
