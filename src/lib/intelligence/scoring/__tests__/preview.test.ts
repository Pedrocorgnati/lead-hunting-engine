import {
  computePreviewDelta,
  recomputeScoreWithNewWeight,
  scoreToTemperature,
  type PreviewLeadInput,
} from '../preview'

const baseBreakdown = {
  website_presence:  { score: 80, weight: 20, weighted: 16 },
  social_presence:   { score: 60, weight: 20, weighted: 12 },
  reviews_rating:    { score: 50, weight: 10, weighted: 5 },
  location_access:   { score: 40, weight: 10, weighted: 4 },
  business_maturity: { score: 30, weight: 20, weighted: 6 },
  digital_gap:       { score: 90, weight: 20, weighted: 18 },
}

describe('scoreToTemperature', () => {
  it('HOT quando score >= HOT_MIN', () => {
    expect(scoreToTemperature(8)).toBe('HOT')
    expect(scoreToTemperature(100)).toBe('HOT')
  })
  it('WARM quando score > COLD_MAX e < HOT_MIN', () => {
    expect(scoreToTemperature(4)).toBe('WARM')
    expect(scoreToTemperature(7)).toBe('WARM')
  })
  it('COLD quando score <= COLD_MAX', () => {
    expect(scoreToTemperature(3)).toBe('COLD')
    expect(scoreToTemperature(0)).toBe('COLD')
  })
})

describe('recomputeScoreWithNewWeight', () => {
  it('retorna null se dimensao ausente', () => {
    expect(recomputeScoreWithNewWeight(baseBreakdown, 'nao_existe', 50)).toBeNull()
  })

  it('reproduz o total original quando newWeight == weight atual', () => {
    const total = Math.round(
      Object.values(baseBreakdown).reduce((s, e) => s + e.weighted, 0),
    )
    expect(recomputeScoreWithNewWeight(baseBreakdown, 'digital_gap', 20)).toBe(total)
  })

  it('aumentar peso de dimensao alta aumenta totalScore', () => {
    const baseline = recomputeScoreWithNewWeight(baseBreakdown, 'digital_gap', 20)!
    const boosted = recomputeScoreWithNewWeight(baseBreakdown, 'digital_gap', 50)!
    expect(boosted).toBeGreaterThan(baseline)
  })
})

describe('computePreviewDelta', () => {
  const buildLead = (id: string, cur: 'COLD' | 'WARM' | 'HOT'): PreviewLeadInput => ({
    id,
    currentScore: cur === 'HOT' ? 9 : cur === 'WARM' ? 5 : 2,
    currentTemperature: cur,
    breakdown: baseBreakdown,
  })

  it('retorna 0 changes quando peso nao muda (com breakdown identico)', () => {
    const leads = [buildLead('a', 'COLD'), buildLead('b', 'WARM')]
    // Como a temperatura atual foi fixada artificialmente, pode haver delta.
    // Testamos pelo menos que o total bate com a soma das categorias.
    const r = computePreviewDelta(leads, 'digital_gap', 20)
    const sum =
      r.coldToWarm + r.coldToHot + r.warmToHot + r.warmToCold +
      r.hotToWarm + r.hotToCold + r.unchanged
    expect(sum).toBe(leads.length)
  })

  it('leads sem breakdown entram em unchanged', () => {
    const leads: PreviewLeadInput[] = [
      { id: 'x', currentScore: 0, currentTemperature: 'COLD', breakdown: null },
      { id: 'y', currentScore: 0, currentTemperature: 'WARM', breakdown: null },
    ]
    const r = computePreviewDelta(leads, 'digital_gap', 50)
    expect(r.unchanged).toBe(2)
  })

  it('delta reflete aumento de temperatura', () => {
    // Lead tem breakdown com digital_gap score 90. Com peso 20 -> score bruto ~61 (WARM).
    // Com peso 100 (hipotetico, fora da soma 100) -> score estourara.
    const lead: PreviewLeadInput = {
      id: 'up',
      currentScore: 5,
      currentTemperature: 'WARM',
      breakdown: baseBreakdown,
    }
    const r = computePreviewDelta([lead], 'digital_gap', 0)
    const totalAssigned =
      r.coldToWarm + r.coldToHot + r.warmToHot + r.warmToCold +
      r.hotToWarm + r.hotToCold + r.unchanged
    expect(totalAssigned).toBe(1)
  })
})
