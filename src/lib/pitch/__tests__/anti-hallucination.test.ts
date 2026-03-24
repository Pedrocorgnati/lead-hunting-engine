import { validatePitch } from '@/lib/pitch/anti-hallucination'
import type { LeadContext } from '@/lib/pitch/prompt-builder'

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

describe('validatePitch', () => {
  it('retorna válido para pitch correto', () => {
    const pitch =
      'Olá, Padaria Bom Pão! Notamos que seu negócio tem grande potencial digital. Podemos agendar uma conversa?'
    const result = validatePitch(pitch, makeLead())
    expect(result).toEqual({ valid: true, issues: [] })
  })

  it('detecta alucinação de URL quando lead não tem website', () => {
    const lead = makeLead({ website: null })
    const pitch =
      'Analisamos seu site http://padaria.com.br e notamos oportunidades de melhoria.'
    const result = validatePitch(pitch, lead)
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('URL de site'),
      ])
    )
  })

  it('detecta alucinação de telefone quando lead não tem phone', () => {
    const lead = makeLead({ phone: null })
    const pitch =
      'Tentamos ligar para (11) 98765-4321 mas não conseguimos contato. Podemos agendar um horário?'
    const result = validatePitch(pitch, lead)
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('telefone'),
      ])
    )
  })

  it('detecta pitch com mais de 200 palavras', () => {
    const longPitch = Array(210).fill('palavra').join(' ') + ' agendar'
    const result = validatePitch(longPitch, makeLead())
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/muito longo.*palavras/),
      ])
    )
  })

  it('detecta pitch sem call-to-action', () => {
    const pitch = 'Seu negócio tem potencial digital muito grande. Obrigado pela atenção.'
    const result = validatePitch(pitch, makeLead())
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('call-to-action'),
      ])
    )
  })

  it('aceita pitch com CTA válido', () => {
    const pitch = 'Seu negócio tem potencial. Podemos agendar uma conversa de 15 minutos?'
    const result = validatePitch(pitch, makeLead())
    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('retorna múltiplos problemas simultaneamente', () => {
    const lead = makeLead({ phone: null })
    // Pitch longo, sem CTA, com telefone inventado
    const words = Array(201).fill('texto').join(' ')
    const pitch = `${words} Ligue para (11) 91234-5678.`
    const result = validatePitch(pitch, lead)
    expect(result.valid).toBe(false)
    expect(result.issues.length).toBeGreaterThanOrEqual(2)
  })
})
