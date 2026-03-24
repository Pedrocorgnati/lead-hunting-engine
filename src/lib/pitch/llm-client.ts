import { getApiKey } from '@/lib/workers/utils/get-credential'
import { LLM_MAX_INPUT_TOKENS, LLM_MAX_OUTPUT_TOKENS } from './constants'

export interface LLMResult {
  content: string
  provider: string
  inputTokens: number
  outputTokens: number
}

export class LLMUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LLMUnavailableError'
  }
}

export async function generateWithLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResult> {
  // Tentar Anthropic primeiro
  const anthropicKey = await getApiKey('anthropic')
  if (anthropicKey) {
    try {
      return await generateWithAnthropic(anthropicKey, systemPrompt, userPrompt)
    } catch (e) {
      console.warn('Anthropic falhou, tentando OpenAI:', (e as Error).message)
    }
  }

  // Fallback OpenAI
  const openaiKey = await getApiKey('openai')
  if (openaiKey) {
    try {
      return await generateWithOpenAI(openaiKey, systemPrompt, userPrompt)
    } catch (e) {
      console.warn('OpenAI falhou:', (e as Error).message)
    }
  }

  // Nenhum provider disponível → PITCH_050
  throw new LLMUnavailableError(
    'Nenhum provider LLM disponível. Configure Anthropic ou OpenAI em Configurações > Credenciais.'
  )
}

async function generateWithAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResult> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: LLM_MAX_OUTPUT_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt.slice(0, LLM_MAX_INPUT_TOKENS * 4) }],
  })

  const content =
    response.content[0].type === 'text' ? response.content[0].text : ''

  return {
    content,
    provider: 'anthropic',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

async function generateWithOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResult> {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey })

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: LLM_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt.slice(0, LLM_MAX_INPUT_TOKENS * 4) },
    ],
  })

  const content = response.choices[0]?.message?.content ?? ''

  return {
    content,
    provider: 'openai',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
  }
}
