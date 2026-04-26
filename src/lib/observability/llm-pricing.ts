/**
 * TASK-10 intake-review (CL-243): tabela estatica de preco por 1M tokens
 * para LLMs. Usada como fallback quando SystemConfig.llm_pricing (JSON editavel
 * pelo admin) esta vazio ou o par provider/model nao existe la.
 *
 * Valores em USD por 1 000 000 tokens (1M) — atualizar conforme pricing public.
 */

export interface LlmPricePerMillion {
  input: number
  output: number
}

export type LlmPricingTable = Record<string, Record<string, LlmPricePerMillion>>

export const DEFAULT_LLM_PRICING: LlmPricingTable = {
  openai: {
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4.1': { input: 2, output: 8 },
    'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  },
  anthropic: {
    'claude-opus-4-7': { input: 15, output: 75 },
    'claude-sonnet-4-6': { input: 3, output: 15 },
    'claude-haiku-4-5-20251001': { input: 1, output: 5 },
    'claude-3-5-sonnet': { input: 3, output: 15 },
    'claude-3-5-haiku': { input: 0.8, output: 4 },
  },
}

/**
 * Calcula custo em USD para uma chamada LLM dado tokens de entrada/saida e
 * a tabela de precos. Retorna null quando provider/model nao sao conhecidos —
 * caller decide se loga mesmo assim (com costUsd null) ou ignora.
 */
export function estimateLlmCostUsd(
  pricing: LlmPricingTable,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const providerTable = pricing[provider.toLowerCase()]
  const row = providerTable?.[model]
  if (!row) return null
  const cost =
    (inputTokens / 1_000_000) * row.input + (outputTokens / 1_000_000) * row.output
  // arredonda para 6 casas (schema Decimal(10,6))
  return Math.round(cost * 1_000_000) / 1_000_000
}
