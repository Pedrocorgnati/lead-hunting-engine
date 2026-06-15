/**
 * outreach-engine (brainstorm 06-10, task 19 — F-19): envelope de qualidade
 * de dados. Score 0-100 de integridade — gate de elegibilidade de
 * auto-outbound. Funcao PURA (testavel sem banco).
 *
 * Composicao (hard vs soft, secao 5.4-F19 do fonte):
 *  HARD (peso alto — sem isso nao se envia):
 *   - email presente e com forma valida ......... 35
 *   - email NAO-generico (pessoal/nominal) ...... 10
 *  SOFT (peso menor — qualidade do alvo):
 *   - dominio/site presente ..................... 15
 *   - telefone normalizado ...................... 10
 *   - placeId (identidade confiavel) ............ 10
 *   - enriquecimento recente (< 90 dias) ........ 10
 *   - >= 2 fontes de proveniencia ............... 10
 *
 * `hardValid` = email presente e bem-formado: o gate de envio exige isso
 * independente do score numerico (criterio hard do fonte).
 */

import { isGenericEmail } from '@/lib/intelligence/enrichment/enrichers/email-prioritizer'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface IntegrityInput {
  email?: string | null
  website?: string | null
  phoneNormalized?: string | null
  placeId?: string | null
  enrichedAt?: Date | string | null
  enrichmentSources?: string[] | null
  /** Override de "generico" quando o caller ja sabe (isGenericEmail). */
  emailIsGeneric?: boolean | null
}

export interface IntegrityResult {
  score: number
  hardValid: boolean
  breakdown: Record<string, number>
  reasons: string[]
}

export function computeIntegrityScore(
  input: IntegrityInput,
  now: Date = new Date(),
): IntegrityResult {
  const breakdown: Record<string, number> = {}
  const reasons: string[] = []
  let score = 0

  const email = input.email?.trim().toLowerCase() ?? null
  const emailValid = Boolean(email && EMAIL_SHAPE.test(email))
  if (emailValid) {
    breakdown.email_present = 35
    score += 35
    // Detector canonico unico: isGenericEmail (email-prioritizer). O caller
    // pode passar emailIsGeneric ja resolvido; senao usamos a mesma fonte —
    // sem lista divergente duplicada (fix da revisao).
    const generic =
      input.emailIsGeneric !== null && input.emailIsGeneric !== undefined
        ? input.emailIsGeneric
        : isGenericEmail(email!)
    if (!generic) {
      breakdown.email_personal = 10
      score += 10
    } else {
      reasons.push('e-mail generico (contato@/info@) — menor taxa de resposta')
    }
  } else {
    reasons.push('sem e-mail valido — inelegivel para auto-outbound')
  }

  if (input.website) {
    breakdown.website = 15
    score += 15
  } else {
    reasons.push('sem site/dominio')
  }
  if (input.phoneNormalized) {
    breakdown.phone = 10
    score += 10
  }
  if (input.placeId) {
    breakdown.place_id = 10
    score += 10
  }

  const enrichedAt = input.enrichedAt ? new Date(input.enrichedAt) : null
  if (enrichedAt && !Number.isNaN(enrichedAt.getTime())) {
    const ageDays = (now.getTime() - enrichedAt.getTime()) / 86_400_000
    if (ageDays <= 90) {
      breakdown.fresh = 10
      score += 10
    } else {
      reasons.push(`enriquecimento desatualizado (${Math.round(ageDays)} dias)`)
    }
  }

  const sources = input.enrichmentSources ?? []
  if (sources.length >= 2) {
    breakdown.multi_source = 10
    score += 10
  }

  return {
    score: Math.min(100, score),
    hardValid: emailValid,
    breakdown,
    reasons,
  }
}

/**
 * Hot-zone (task 20/F-20): leads que justificam enriquecimento FULL (caro).
 * Score de oportunidade alto OU sinais fortes de compra. Mantem o gate de
 * env DETAILED_ENRICHMENT como kill-switch global, mas permite decisao
 * per-lead quando ligado em modo seletivo.
 */
export function isHotZone(input: {
  score?: number | null
  temperature?: string | null
  signals?: string[] | null
  hotScoreThreshold?: number
}): boolean {
  const threshold = input.hotScoreThreshold ?? 70
  if ((input.score ?? 0) >= threshold) return true
  if (input.temperature === 'HOT') return true
  const strongSignals = ['site-bad-or-absent', 'strong-ig-weak-site', 'high-intent']
  return (input.signals ?? []).some((s) => strongSignals.includes(s))
}
