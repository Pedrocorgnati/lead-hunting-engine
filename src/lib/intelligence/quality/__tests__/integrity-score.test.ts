/**
 * outreach-engine (06-10, task 19/F-19): envelope de qualidade de dados.
 */
import { computeIntegrityScore, isHotZone } from '../integrity-score'

const NOW = new Date('2026-06-10T12:00:00Z')

describe('computeIntegrityScore', () => {
  it('lead completo com email pessoal => score alto e hardValid', () => {
    const r = computeIntegrityScore(
      {
        email: 'maria.silva@padariacentral.com.br',
        website: 'https://padariacentral.com.br',
        phoneNormalized: '5519999999999',
        placeId: 'gp-1',
        enrichedAt: NOW,
        enrichmentSources: ['google-places', 'website'],
      },
      NOW,
    )
    expect(r.hardValid).toBe(true)
    expect(r.score).toBe(100)
  })

  it('email generico perde os pontos de email_personal', () => {
    const r = computeIntegrityScore({ email: 'contato@empresa.com.br' }, NOW)
    expect(r.hardValid).toBe(true)
    expect(r.breakdown.email_present).toBe(35)
    expect(r.breakdown.email_personal).toBeUndefined()
    expect(r.reasons).toContain('e-mail generico (contato@/info@) — menor taxa de resposta')
  })

  it('emailIsGeneric explicito sobrepoe a heuristica', () => {
    const personalLooking = computeIntegrityScore(
      { email: 'joao@empresa.com.br', emailIsGeneric: true },
      NOW,
    )
    expect(personalLooking.breakdown.email_personal).toBeUndefined()
  })

  it('sem email valido => hardValid=false (inelegivel para auto-outbound)', () => {
    const r = computeIntegrityScore({ email: 'sem-arroba', website: 'https://x.com' }, NOW)
    expect(r.hardValid).toBe(false)
    expect(r.reasons).toContain('sem e-mail valido — inelegivel para auto-outbound')
  })

  it('enriquecimento antigo nao pontua frescor', () => {
    const old = new Date(NOW.getTime() - 120 * 86_400_000)
    const r = computeIntegrityScore(
      { email: 'a@b.com', enrichedAt: old, enrichmentSources: ['x', 'y'] },
      NOW,
    )
    expect(r.breakdown.fresh).toBeUndefined()
    expect(r.reasons.some((x) => x.includes('desatualizado'))).toBe(true)
  })
})

describe('isHotZone', () => {
  it('score alto => hot', () => {
    expect(isHotZone({ score: 85 })).toBe(true)
  })
  it('temperatura HOT => hot', () => {
    expect(isHotZone({ score: 10, temperature: 'HOT' })).toBe(true)
  })
  it('sinal forte => hot', () => {
    expect(isHotZone({ score: 10, signals: ['site-bad-or-absent'] })).toBe(true)
  })
  it('lead frio sem sinais => nao-hot', () => {
    expect(isHotZone({ score: 20, signals: ['some-weak-signal'] })).toBe(false)
  })
})
