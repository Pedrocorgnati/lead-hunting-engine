/**
 * Invariantes do mapping INTAKE → DB (docs/scoring-weight-mapping.md).
 * TASK-2 ST004.
 */

import { DEFAULT_SCORING_RULES } from '@/lib/scoring/default-rules'

describe('scoring weight mapping', () => {
  it('soma dos pesos = 100', () => {
    const sum = DEFAULT_SCORING_RULES.reduce((acc, r) => acc + r.weight, 0)
    expect(sum).toBe(100)
  })

  it('todas as regras padrão começam ativas', () => {
    for (const rule of DEFAULT_SCORING_RULES) {
      expect(rule.isActive).toBe(true)
    }
  })

  it('ordenação INTAKE preservada: pesos 3 >= pesos 2', () => {
    const high = DEFAULT_SCORING_RULES.filter(r => r.intakeWeight === 3)
    const low = DEFAULT_SCORING_RULES.filter(r => r.intakeWeight === 2)
    expect(high.length).toBeGreaterThan(0)
    expect(low.length).toBeGreaterThan(0)
    for (const h of high) {
      for (const l of low) {
        expect(h.weight).toBeGreaterThanOrEqual(l.weight)
      }
    }
  })

  it('slugs canônicos alinhados com scoring-engine DIMENSION_MAP', () => {
    const slugs = DEFAULT_SCORING_RULES.map(r => r.slug).sort()
    expect(slugs).toEqual(
      [
        'business_maturity',
        'digital_gap',
        'location_access',
        'reviews_rating',
        'social_presence',
        'website_presence',
      ].sort(),
    )
  })

  it('pesos de sinais INTAKE 3 (website_presence, business_maturity, digital_gap) ≥ pesos de sinais INTAKE 2', () => {
    const w = Object.fromEntries(DEFAULT_SCORING_RULES.map(r => [r.slug, r.weight]))
    expect(w.website_presence).toBeGreaterThanOrEqual(w.social_presence)
    expect(w.website_presence).toBeGreaterThanOrEqual(w.reviews_rating)
    expect(w.website_presence).toBeGreaterThanOrEqual(w.location_access)
    expect(w.business_maturity).toBeGreaterThanOrEqual(w.social_presence)
    expect(w.business_maturity).toBeGreaterThanOrEqual(w.reviews_rating)
    expect(w.digital_gap).toBeGreaterThanOrEqual(w.social_presence)
    expect(w.digital_gap).toBeGreaterThanOrEqual(w.reviews_rating)
  })

  it('CL-IDs esperados estão documentados em clSources', () => {
    const allCls = DEFAULT_SCORING_RULES.flatMap(r => r.clSources).sort()
    expect(allCls).toEqual(
      ['CL-069', 'CL-070', 'CL-071', 'CL-072', 'CL-073', 'CL-074'].sort(),
    )
  })
})
