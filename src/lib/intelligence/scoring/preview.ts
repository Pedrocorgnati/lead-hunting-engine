import { SCORE_TEMPERATURE_THRESHOLDS } from '@/lib/constants/enums'
import type { LeadTemperature } from '@/lib/constants/enums'

/**
 * Recalculo de temperatura a partir do scoreBreakdown persistido no lead,
 * aplicando um novo peso em UMA regra especifica. Nao persiste — usado
 * exclusivamente pelo endpoint de preview (/admin/config/scoring-rules/preview).
 */

export interface ScoreBreakdownEntry {
  score: number
  weight: number
  weighted: number
}

export type ScoreBreakdown = Record<string, ScoreBreakdownEntry>

export interface PreviewDelta {
  coldToWarm: number
  warmToHot: number
  warmToCold: number
  hotToWarm: number
  coldToHot: number
  hotToCold: number
  unchanged: number
}

export interface PreviewLeadInput {
  id: string
  currentScore: number
  currentTemperature: LeadTemperature
  breakdown: ScoreBreakdown | null
}

export interface PreviewResult {
  totalLeads: number
  sampled: boolean
  changes: PreviewDelta
}

export function scoreToTemperature(score: number): LeadTemperature {
  if (score >= SCORE_TEMPERATURE_THRESHOLDS.HOT_MIN) return 'HOT'
  if (score > SCORE_TEMPERATURE_THRESHOLDS.COLD_MAX) return 'WARM'
  return 'COLD'
}

/**
 * Recalcula o totalScore de um lead substituindo o peso de UMA dimensao.
 * Preserva os outros pesos tal como estavam no ultimo calculo (snapshot em breakdown).
 * Retorna null se breakdown ausente ou a dimensao alvo nao existir no snapshot.
 */
export function recomputeScoreWithNewWeight(
  breakdown: ScoreBreakdown,
  ruleSlug: string,
  newWeight: number,
): number | null {
  const entry = breakdown[ruleSlug]
  if (!entry) return null

  let weightedSum = 0
  for (const [dim, data] of Object.entries(breakdown)) {
    const w = dim === ruleSlug ? newWeight : data.weight
    weightedSum += (data.score * w) / 100
  }
  return Math.round(weightedSum)
}

function emptyDelta(): PreviewDelta {
  return {
    coldToWarm: 0,
    warmToHot: 0,
    warmToCold: 0,
    hotToWarm: 0,
    coldToHot: 0,
    hotToCold: 0,
    unchanged: 0,
  }
}

/**
 * Agrega delta de temperatura para um conjunto de leads, aplicando `newWeight`
 * a regra identificada por `ruleSlug`.
 */
export function computePreviewDelta(
  leads: PreviewLeadInput[],
  ruleSlug: string,
  newWeight: number,
): PreviewDelta {
  const delta = emptyDelta()
  for (const lead of leads) {
    if (!lead.breakdown) {
      delta.unchanged += 1
      continue
    }
    const nextScore = recomputeScoreWithNewWeight(lead.breakdown, ruleSlug, newWeight)
    if (nextScore == null) {
      delta.unchanged += 1
      continue
    }
    const nextTemp = scoreToTemperature(nextScore)
    const cur = lead.currentTemperature

    if (cur === nextTemp) {
      delta.unchanged += 1
      continue
    }

    const key = `${cur.toLowerCase()}To${nextTemp[0]}${nextTemp.slice(1).toLowerCase()}` as keyof PreviewDelta
    if (key in delta) delta[key] += 1
  }
  return delta
}
