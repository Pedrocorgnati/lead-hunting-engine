import { OpportunityType } from '@/lib/constants/enums'
import type { ScoreResult } from '../scoring/scoring-engine'
import type { EnrichedLeadData } from '../enrichment/types'

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
 * Retorna array com 1 item (Lead.opportunities é OpportunityType[]).
 */
export function classifyOpportunity(
  scoreResult: ScoreResult,
  enriched: EnrichedLeadData,
): OpportunityType {
  const digitalGap = enriched.scores.digitalGap
  const businessMaturity = enriched.scores.businessMaturity

  const opportunityScore = businessMaturity * 0.5 + digitalGap * 0.5

  if (opportunityScore >= 80) return OpportunityType.A_NEEDS_SITE
  if (opportunityScore >= 65) return OpportunityType.B_NEEDS_SYSTEM
  if (opportunityScore >= 50) return OpportunityType.C_NEEDS_AUTOMATION
  if (opportunityScore >= 35) return OpportunityType.D_NEEDS_ECOMMERCE
  return OpportunityType.E_SCALE
}
