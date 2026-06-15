import { kvGet, kvSet, kvDelete } from '../kv-cache'

describe('kv-cache', () => {
  it('set/get retorna o valor dentro do TTL', async () => {
    await kvSet('k1', { a: 1 }, 10_000)
    expect(await kvGet('k1')).toEqual({ a: 1 })
  })

  it('retorna null para chave inexistente', async () => {
    expect(await kvGet('nao-existe')).toBeNull()
  })

  it('expira apos o TTL', async () => {
    await kvSet('k-exp', 'v', -1) // TTL negativo = ja expirado
    expect(await kvGet('k-exp')).toBeNull()
  })

  it('kvDelete remove a chave', async () => {
    await kvSet('k-del', 'v', 10_000)
    kvDelete('k-del')
    expect(await kvGet('k-del')).toBeNull()
  })

  it('P-11: limita o tamanho do cache e despeja os mais antigos (LRU)', async () => {
    // Preenche bem acima do limite (MAX_ENTRIES=5000). As chaves mais antigas
    // devem ser despejadas; as recentes permanecem.
    for (let i = 0; i < 5200; i++) {
      await kvSet(`bulk:${i}`, i, 60_000)
    }
    expect(await kvGet('bulk:0')).toBeNull()       // mais antiga -> despejada
    expect(await kvGet('bulk:5199')).toBe(5199)    // mais recente -> presente
  })
})
