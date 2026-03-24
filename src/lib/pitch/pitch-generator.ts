import { buildPitchPrompt, type LeadContext } from './prompt-builder'
import { generateWithLLM, LLMUnavailableError } from './llm-client'
import { validatePitch, type ValidationResult } from './anti-hallucination'
import type { ToneOption } from './tone-config'
import { ANTI_HALLUCINATION_MAX_RETRIES } from './constants'

export { LLMUnavailableError }

export class HallucinatedPitchError extends Error {
  public readonly issues: string[]
  constructor(issues: string[]) {
    super('Pitch rejeitado por anti-alucinação após retries esgotados.')
    this.name = 'HallucinatedPitchError'
    this.issues = issues
  }
}

export async function generatePitch(
  lead: LeadContext,
  tone: ToneOption
): Promise<{
  pitch: string
  provider: string
  validation: ValidationResult
  tokens: { input: number; output: number }
}> {
  const { systemPrompt, userPrompt } = buildPitchPrompt(lead, tone)

  let lastValidation: ValidationResult = { valid: false, issues: [] }

  for (let attempt = 1; attempt <= ANTI_HALLUCINATION_MAX_RETRIES; attempt++) {
    const result = await generateWithLLM(systemPrompt, userPrompt)
    const validation = validatePitch(result.content, lead)

    if (validation.valid) {
      return {
        pitch: result.content,
        provider: result.provider,
        validation,
        tokens: { input: result.inputTokens, output: result.outputTokens },
      }
    }

    lastValidation = validation
    console.warn(
      `Anti-hallucination retry ${attempt}/${ANTI_HALLUCINATION_MAX_RETRIES}:`,
      validation.issues
    )
  }

  // Esgotou retries → PITCH_051
  throw new HallucinatedPitchError(lastValidation.issues)
}
