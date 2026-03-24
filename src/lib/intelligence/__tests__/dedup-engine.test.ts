import { DedupEngine, stringSimilarity } from '../dedup-engine'

describe('stringSimilarity', () => {
  it('[SUCCESS] retorna 1 para strings idênticas', () => {
    expect(stringSimilarity('restaurante sushi', 'restaurante sushi')).toBe(1)
  })

  it('[SUCCESS] retorna alta similaridade para variações pequenas (typo, acento)', () => {
    const sim = stringSimilarity('restaurante tokyo', 'restaurante tokio')
    expect(sim).toBeGreaterThan(0.85)
  })

  it('[SUCCESS] retorna baixa similaridade para nomes completamente diferentes', () => {
    const sim = stringSimilarity('restaurante tokyo', 'padaria central')
    expect(sim).toBeLessThan(0.4)
  })

  it('[EDGE] retorna 0 quando um dos strings é vazio', () => {
    expect(stringSimilarity('', 'algum nome')).toBe(0)
    expect(stringSimilarity('algum nome', '')).toBe(0)
  })

  it('[EDGE] retorna 1 para strings de um caractere idênticas', () => {
    expect(stringSimilarity('a', 'a')).toBe(1)
  })
})

describe('DedupEngine.deduplicateWithinBatch', () => {
  it('[SUCCESS] remove duplicatas dentro do batch (variação de escrita)', () => {
    const candidates = [
      { name: 'Sushi Place', address: 'Av. Paulista, 1000', externalId: 'ext-1' },
      { name: 'Sushi Place', address: 'Avenida Paulista, 1000', externalId: 'ext-2' },
      { name: 'Padaria Central', address: 'Rua XV', externalId: 'ext-3' },
    ]
    const result = DedupEngine.deduplicateWithinBatch(candidates)
    expect(result).toHaveLength(2)
  })

  it('[SUCCESS] mantém leads distintos sem remover nada', () => {
    const candidates = [
      { name: 'Sushi Place', address: 'Av. Paulista', externalId: 'ext-1' },
      { name: 'Padaria Central', address: 'Rua XV', externalId: 'ext-2' },
    ]
    const result = DedupEngine.deduplicateWithinBatch(candidates)
    expect(result).toHaveLength(2)
  })

  it('[EDGE] retorna array vazio quando recebe array vazio', () => {
    expect(DedupEngine.deduplicateWithinBatch([])).toHaveLength(0)
  })

  it('[EDGE] retorna o item quando recebe array com 1 elemento', () => {
    const result = DedupEngine.deduplicateWithinBatch([
      { name: 'Único', address: null, externalId: 'ext-1' },
    ])
    expect(result).toHaveLength(1)
  })
})
