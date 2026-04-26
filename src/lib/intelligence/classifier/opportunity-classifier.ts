import { OpportunityType } from '@/lib/constants/enums'
import type { ScoreResult } from '../scoring/scoring-engine'
import type { EnrichedLeadData } from '../enrichment/types'

export interface SocialSignals {
  facebookAbandoned?: boolean
  siteReachable?: boolean | null
}

/**
 * Classifica oportunidade comercial.
 *
 * Lógica: opportunityScore = (businessMaturity * 0.5 + digitalGap * 0.5)
 * - A_NEEDS_SITE  ≥ 80 → negócio estabelecido sem site
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
  // Override direto: FB abandonado com site ausente = oportunidade A_NEEDS_SITE
  if (socialSignals?.facebookAbandoned && socialSignals.siteReachable === false) {
    return OpportunityType.A_NEEDS_SITE
  }

  const digitalGap = enriched.scores.digitalGap
  const businessMaturity = enriched.scores.businessMaturity

  const opportunityScore = businessMaturity * 0.5 + digitalGap * 0.5

  let baseType: OpportunityType
  if (opportunityScore >= 80) baseType = OpportunityType.A_NEEDS_SITE
  else if (opportunityScore >= 65) baseType = OpportunityType.B_NEEDS_SYSTEM
  else if (opportunityScore >= 50) baseType = OpportunityType.C_NEEDS_AUTOMATION
  else if (opportunityScore >= 35) baseType = OpportunityType.D_NEEDS_ECOMMERCE
  else baseType = OpportunityType.E_SCALE

  // Reforcador: FB abandonado com site presente promove um tier (E->D, D->C)
  if (socialSignals?.facebookAbandoned && socialSignals.siteReachable !== false) {
    if (baseType === OpportunityType.E_SCALE) return OpportunityType.D_NEEDS_ECOMMERCE
    if (baseType === OpportunityType.D_NEEDS_ECOMMERCE) return OpportunityType.C_NEEDS_AUTOMATION
  }

  return baseType
}
