import { OpportunityType } from '@/lib/constants/enums'
import type { ScoreResult } from '../scoring/scoring-engine'
import type { EnrichedLeadData } from '../enrichment/types'

export interface SocialSignals {
  facebookAbandoned?: boolean
  siteReachable?: boolean | null
}

export interface ClassificationRuleConfig {
  opportunityType: OpportunityType
  minScore: number
  maxScore: number
  requiredSignals?: string[]
}

const DEFAULT_RULES: ClassificationRuleConfig[] = [
  { opportunityType: OpportunityType.A_NEEDS_SITE, minScore: 80, maxScore: 100 },
  { opportunityType: OpportunityType.B_NEEDS_SYSTEM, minScore: 65, maxScore: 79 },
  { opportunityType: OpportunityType.C_NEEDS_AUTOMATION, minScore: 50, maxScore: 64 },
  { opportunityType: OpportunityType.D_NEEDS_ECOMMERCE, minScore: 35, maxScore: 49 },
  { opportunityType: OpportunityType.E_SCALE, minScore: 0, maxScore: 34 },
]

/**
 * Classifica oportunidade comercial.
 *
 * Lógica (P-05): opportunityScore =
 *   businessMaturity * 0.4 + digitalGap * 0.4 + (100 - websitePresence) * 0.2
 *
 * O 3o termo (ausência de website) é DIRETO e não-diluído — antes a única
 * fonte de sinal de site era digitalGap, que é abatido por reviewCount/priceLevel
 * (stage-digital-gap), mascarando "negócio sem site". (100 - websitePresence)
 * vale 100 quando não há site, ~40-60 num site fraco/sem mobile, e 0 num site
 * bom — exatamente o eixo do caso de uso (vender site para quem não tem).
 *
 * - A_NEEDS_SITE  ≥ 80 → negócio estabelecido SEM site
 * - B_NEEDS_SYSTEM ≥ 65 → negócio com site mas sem sistema
 * - C_NEEDS_AUTOMATION ≥ 50 → negócio digital básico sem automação
 * - D_NEEDS_ECOMMERCE ≥ 35 → negócio digital com gap de e-commerce
 * - E_SCALE < 35 → negócio já bem posicionado digitalmente
 *
 * socialSignals: override de sinal FB/IG detectado no enriquecimento.
 * Retorna 1 OpportunityType (Lead.opportunities é OpportunityType[]).
 */
export function classifyOpportunity(
  scoreResult: ScoreResult,
  enriched: EnrichedLeadData,
  socialSignals?: SocialSignals,
): OpportunityType {
  return classifyOpportunityWithConfig(scoreResult, enriched, socialSignals)
}

/**
 * Classifica oportunidade com regras configuráveis.
 * Se config não fornecido, usa defaults hardcoded.
 */
export function classifyOpportunityWithConfig(
  scoreResult: ScoreResult,
  enriched: EnrichedLeadData,
  socialSignals?: SocialSignals,
  config?: ClassificationRuleConfig[],
): OpportunityType {
  // Override direto: FB abandonado com site ausente = oportunidade A_NEEDS_SITE
  if (socialSignals?.facebookAbandoned && socialSignals.siteReachable === false) {
    return OpportunityType.A_NEEDS_SITE
  }

  const digitalGap = enriched.scores.digitalGap
  const businessMaturity = enriched.scores.businessMaturity
  // websitePresence ausente/desconhecido -> trata como 0 (gap maximo), o
  // pressuposto conservador do caso de uso (sem sinal de site = oportunidade).
  const websiteAbsence = 100 - (enriched.scores.websitePresence ?? 0)

  const opportunityScore =
    businessMaturity * 0.4 + digitalGap * 0.4 + websiteAbsence * 0.2

  const rules = config ?? DEFAULT_RULES

  let baseType: OpportunityType = OpportunityType.E_SCALE
  for (const rule of rules) {
    if (opportunityScore >= rule.minScore && opportunityScore <= rule.maxScore) {
      baseType = rule.opportunityType
      break
    }
  }

  // Reforcador: FB abandonado com site presente promove um tier (E->D, D->C)
  if (socialSignals?.facebookAbandoned && socialSignals.siteReachable !== false) {
    if (baseType === OpportunityType.E_SCALE) return OpportunityType.D_NEEDS_ECOMMERCE
    if (baseType === OpportunityType.D_NEEDS_ECOMMERCE) return OpportunityType.C_NEEDS_AUTOMATION
  }

  return baseType
}
