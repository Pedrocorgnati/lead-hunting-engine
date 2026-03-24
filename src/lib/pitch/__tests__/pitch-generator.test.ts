import { generatePitch, HallucinatedPitchError } from '@/lib/pitch/pitch-generator'
import type { LeadContext } from '@/lib/pitch/prompt-builder'

const actualModule =
  jest.requireActual<typeof import('@/lib/pitch/llm-client')>(
    '@/lib/pitch/llm-client'
  )
const { LLMUnavailableError } = actualModule

jest.mock('@/lib/pitch/llm-client', () => {
  const actual =
    jest.requireActual<typeof import('@/lib/pitch/llm-client')>(
      '@/lib/pitch/llm-client'
    )
  return {
    ...actual,
    generateWithLLM: jest.fn(),
  }
})

const { generateWithLLM } = jest.requireMock<
  typeof import('@/lib/pitch/llm-client')
>('@/lib/pitch/llm-client')

function makeLead(overrides: Partial<LeadContext> = {}): LeadContext {
  return {
    businessName: 'Padaria Bom Pão',
    category: 'Alimentação',
    city: 'São Paulo',
    state: 'SP',
    phone: '(11) 99999-1234',
    website: 'https://bompao.com.br',
    rating: 4.5,
    reviewCount: 120,
    digitalGapScore: 72,
    opportunityLabel: 'A',
    scoreBreakdown: {},
    ...overrides,
  }
}

function llmResult(content: string) {
  return {
    content,
    provider: 'anthropic',
    inputTokens: 100,
    outputTokens: 50,
  }
}

const VALID_PITCH =
  'Olá, Padaria Bom Pão! Notamos oportunidades digitais para seu negócio. Podemos agendar uma conversa?'

const INVALID_PITCH =
  'Seu negócio tem potencial digital muito grande. Obrigado pela atenção.'

describe('generatePitch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('retorna pitch válido na primeira tentativa sem retry', async () => {
    generateWithLLM.mockResolvedValueOnce(llmResult(VALID_PITCH))

    const result = await generatePitch(makeLead(), 'formal')

    expect(result.pitch).toBe(VALID_PITCH)
    expect(result.validation.valid).toBe(true)
    expect(result.provider).toBe('anthropic')
    expect(generateWithLLM).toHaveBeenCalledTimes(1)
  })

  it('faz retry quando pitch inválido e retorna na segunda tentativa', async () => {
    generateWithLLM
      .mockResolvedValueOnce(llmResult(INVALID_PITCH))
      .mockResolvedValueOnce(llmResult(VALID_PITCH))

    const result = await generatePitch(makeLead(), 'formal')

    expect(result.pitch).toBe(VALID_PITCH)
    expect(result.validation.valid).toBe(true)
    expect(generateWithLLM).toHaveBeenCalledTimes(2)
  })

  it('lança HallucinatedPitchError quando todas tentativas falham', async () => {
    generateWithLLM
      .mockResolvedValueOnce(llmResult(INVALID_PITCH))
      .mockResolvedValueOnce(llmResult(INVALID_PITCH))

    await expect(generatePitch(makeLead(), 'formal')).rejects.toThrow(
      HallucinatedPitchError
    )

    try {
      generateWithLLM
        .mockResolvedValueOnce(llmResult(INVALID_PITCH))
        .mockResolvedValueOnce(llmResult(INVALID_PITCH))
      await generatePitch(makeLead(), 'formal')
    } catch (err) {
      expect(err).toBeInstanceOf(HallucinatedPitchError)
      expect((err as HallucinatedPitchError).issues.length).toBeGreaterThan(0)
    }
  })

  it('propaga LLMUnavailableError quando LLM indisponível', async () => {
    generateWithLLM.mockRejectedValueOnce(
      new LLMUnavailableError('Nenhum provider LLM disponível.')
    )

    await expect(generatePitch(makeLead(), 'formal')).rejects.toThrow(
      LLMUnavailableError
    )
  })
})
