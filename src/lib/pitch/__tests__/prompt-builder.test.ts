import { buildPitchPrompt, type LeadContext } from '@/lib/pitch/prompt-builder'
import type { ToneOption } from '@/lib/pitch/tone-config'

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

describe('buildPitchPrompt', () => {
  it('inclui todos os campos quando lead tem dados completos', () => {
    const { userPrompt } = buildPitchPrompt(makeLead(), 'formal')
    expect(userPrompt).toContain('Padaria Bom Pão')
    expect(userPrompt).toContain('Alimentação')
    expect(userPrompt).toContain('São Paulo')
    expect(userPrompt).toContain('4.5')
    expect(userPrompt).toContain('bompao.com.br')
    expect(userPrompt).toContain('72/100')
  })

  it('indica "não possui" quando lead não tem website', () => {
    const lead = makeLead({ website: null })
    const { userPrompt } = buildPitchPrompt(lead, 'formal')
    expect(userPrompt).toContain('Site: não possui')
  })

  it('não inclui avaliação quando lead não tem rating', () => {
    const lead = makeLead({ rating: null })
    const { userPrompt } = buildPitchPrompt(lead, 'formal')
    expect(userPrompt).not.toContain('Avaliação')
  })

  it('não inclui localização quando lead não tem city', () => {
    const lead = makeLead({ city: null })
    const { userPrompt } = buildPitchPrompt(lead, 'formal')
    expect(userPrompt).not.toContain('Localização')
  })

  it('produz system prompts diferentes para tons diferentes', () => {
    const tones: ToneOption[] = ['formal', 'informal', 'tecnico']
    const prompts = tones.map(
      (tone) => buildPitchPrompt(makeLead(), tone).systemPrompt
    )

    // All three must be distinct
    const unique = new Set(prompts)
    expect(unique.size).toBe(3)
  })
})
