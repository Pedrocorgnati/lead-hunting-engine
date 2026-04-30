// PITCH_ERROR_CODES sao constantes seguras para Client Components.
// As classes de erro (LLMUnavailableError, HallucinatedPitchError) carregam
// dependencias server-only (prisma/pg via observability/llm-cost) e devem ser
// importadas diretamente de './llm-client' ou './pitch-generator' em codigo
// server-side (route handlers, services, workers).

export const PITCH_ERROR_CODES = {
  LLM_UNAVAILABLE: 'PITCH_050',
  HALLUCINATED: 'PITCH_051',
} as const
