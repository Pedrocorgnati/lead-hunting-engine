export { LLMUnavailableError } from './llm-client'
export { HallucinatedPitchError } from './pitch-generator'

export const PITCH_ERROR_CODES = {
  LLM_UNAVAILABLE: 'PITCH_050',
  HALLUCINATED: 'PITCH_051',
} as const
