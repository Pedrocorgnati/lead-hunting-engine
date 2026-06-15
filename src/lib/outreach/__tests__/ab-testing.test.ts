/**
 * outreach-engine (06-10, task 26/F-26): decisao de vencedor A/B.
 * Aceite: vencedor aplicado SO com amostra minima + significancia + ratificacao.
 */
import { decideAbWinner } from '../ab-testing'

const CFG = { minSamplePerVariant: 200, significanceLevel: 0.05, ratifiedBy: 'pedro' }

describe('decideAbWinner', () => {
  it('nao decide sem ratificacao do operador', () => {
    const d = decideAbWinner(
      [
        { key: 'A', sent: 300, replied: 60 },
        { key: 'B', sent: 300, replied: 20 },
      ],
      { ...CFG, ratifiedBy: null },
    )
    expect(d.decided).toBe(false)
    expect(d.reason).toMatch(/nao ratificados/)
  })

  it('nao decide com amostra abaixo do minimo', () => {
    const d = decideAbWinner(
      [
        { key: 'A', sent: 50, replied: 20 },
        { key: 'B', sent: 50, replied: 2 },
      ],
      CFG,
    )
    expect(d.decided).toBe(false)
    expect(d.reason).toMatch(/amostra insuficiente/)
  })

  it('decide vencedor com amostra suficiente e diferenca significativa', () => {
    const d = decideAbWinner(
      [
        { key: 'A', sent: 1000, replied: 200 }, // 20%
        { key: 'B', sent: 1000, replied: 100 }, // 10%
      ],
      CFG,
    )
    expect(d.decided).toBe(true)
    expect(d.winner).toBe('A')
    expect(d.pValue).toBeLessThanOrEqual(0.05)
  })

  it('nao decide quando a diferenca nao e significativa', () => {
    const d = decideAbWinner(
      [
        { key: 'A', sent: 300, replied: 61 },
        { key: 'B', sent: 300, replied: 60 },
      ],
      CFG,
    )
    expect(d.decided).toBe(false)
    expect(d.reason).toMatch(/nao significativa/)
  })
})
