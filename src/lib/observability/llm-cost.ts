/**
 * TASK-10 intake-review (CL-216, CL-243): wrapper de instrumentacao para
 * chamadas LLM. Registra metrica granular em `api_usage_logs` com `kind=LLM`,
 * tokens, modelo, latencia e custo em USD derivado da tabela de precos.
 *
 * Uso:
 *   const { text } = await withLlmCost(
 *     { provider: 'openai', model: 'gpt-4o-mini', operation: 'pitch.generate',
 *       leadId, userId, correlationId },
 *     async () => {
 *       const res = await openai.chat.completions.create(...)
 *       return {
 *         result: res.choices[0].message.content,
 *         inputTokens: res.usage?.prompt_tokens ?? 0,
 *         outputTokens: res.usage?.completion_tokens ?? 0,
 *       }
 *     }
 *   )
 */

import { prisma } from '@/lib/prisma'
import {
  DEFAULT_LLM_PRICING,
  estimateLlmCostUsd,
  type LlmPricingTable,
} from './llm-pricing'

export interface LlmCostContext {
  provider: string
  model: string
  operation: string
  userId?: string | null
  jobId?: string | null
  leadId?: string | null
  correlationId?: string | null
}

export interface LlmCallResult<T> {
  result: T
  inputTokens: number
  outputTokens: number
}

// Cache em memoria da tabela editavel. Atualmente fica apenas com o fallback
// estatico; quando SystemConfig for introduzido (PENDING-ACTIONS),
// substituir este resolve por query cacheada com TTL curto.
let pricingCache: LlmPricingTable = DEFAULT_LLM_PRICING

export function setLlmPricingTable(pricing: LlmPricingTable): void {
  pricingCache = pricing
}

export function getLlmPricingTable(): LlmPricingTable {
  return pricingCache
}

export async function withLlmCost<T>(
  ctx: LlmCostContext,
  fn: () => Promise<LlmCallResult<T>>
): Promise<T> {
  const startedAt = performance.now()
  let inputTokens = 0
  let outputTokens = 0
  let thrown: unknown = null
  let output: T | undefined

  try {
    const call = await fn()
    output = call.result
    inputTokens = call.inputTokens
    outputTokens = call.outputTokens
  } catch (err) {
    thrown = err
  }

  const latencyMs = Math.round(performance.now() - startedAt)
  const costUsd = estimateLlmCostUsd(
    pricingCache,
    ctx.provider,
    ctx.model,
    inputTokens,
    outputTokens
  )

  // Fire-and-forget: nunca travar o fluxo de usuario por falha de observabilidade.
  void prisma.apiUsageLog
    .create({
      data: {
        kind: 'LLM',
        provider: ctx.provider,
        model: ctx.model,
        operation: ctx.operation,
        callType: ctx.operation,
        inputTokens,
        outputTokens,
        costUsd: costUsd !== null ? costUsd : null,
        latencyMs,
        userId: ctx.userId ?? undefined,
        jobId: ctx.jobId ?? undefined,
        leadId: ctx.leadId ?? undefined,
        correlationId: ctx.correlationId ?? undefined,
        metadata: {
          error: thrown ? String((thrown as Error)?.message ?? thrown) : null,
        },
      },
    })
    .catch((err) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[llm-cost] falha ao persistir metrica:', err)
      }
    })

  if (thrown) throw thrown
  return output as T
}
