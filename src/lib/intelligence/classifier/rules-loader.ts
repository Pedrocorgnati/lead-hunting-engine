import { prisma } from '@/lib/prisma'
import type { OpportunityType } from '@/lib/constants/enums'
import type { ClassificationRuleConfig } from './opportunity-classifier'

/**
 * Loader das regras de classificacao salvas pelo admin (ST003 / item 043).
 *
 * Fonte: tabela classification_rules (editada em AD20 /admin/classificacao).
 * O classificador de producao (trigger process-leads) consome estas regras;
 * tabela vazia ou erro de leitura cai para os defaults hardcoded do
 * opportunity-classifier (fail-open deliberado: coleta nunca para por causa
 * de configuracao ausente).
 *
 * Cache em memoria com TTL de 60s: process-leads roda em lotes e a edicao de
 * regra nao precisa de efeito instantaneo (proximo lote ja pega o novo set).
 */
const CACHE_TTL_MS = 60_000

let cache: { rules: ClassificationRuleConfig[] | null; loadedAt: number } | null = null

export async function loadClassificationRules(): Promise<ClassificationRuleConfig[] | undefined> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.rules ?? undefined
  }
  try {
    const rows = await prisma.classificationRule.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { opportunityType: true, minScore: true, maxScore: true, requiredSignals: true },
    })
    const rules: ClassificationRuleConfig[] | null = rows.length
      ? rows.map((r) => ({
          opportunityType: r.opportunityType as OpportunityType,
          minScore: r.minScore,
          maxScore: r.maxScore,
          requiredSignals: r.requiredSignals,
        }))
      : null
    cache = { rules, loadedAt: Date.now() }
    return rules ?? undefined
  } catch {
    // Falha de leitura nao bloqueia o pipeline: defaults hardcoded assumem.
    cache = { rules: null, loadedAt: Date.now() }
    return undefined
  }
}

/** Invalida o cache (usado por testes e pelo POST de regras do admin). */
export function invalidateClassificationRulesCache(): void {
  cache = null
}
