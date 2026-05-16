import { semanticHash } from '@/lib/cache/semantic-hash'

describe('semanticHash', () => {
  it('returns same bucket for identical prompts', async () => {
    const a = await semanticHash('list top 5 leads from Brazil tech sector')
    const b = await semanticHash('list top 5 leads from Brazil tech sector')
    expect(a).toBe(b)
  })

  it('returns different buckets for distinct prompts', async () => {
    const a = await semanticHash('list top 5 leads from Brazil tech sector')
    const b = await semanticHash('find healthcare leads in São Paulo')
    expect(a).not.toBe(b)
  })

  it('normalizes whitespace and case', async () => {
    const a = await semanticHash('List Top 5 Leads')
    const b = await semanticHash('  list  top  5  leads  ')
    expect(a).toBe(b)
  })

  it('returns a hex string of expected length', async () => {
    const h = await semanticHash('test prompt')
    expect(h).toMatch(/^[a-f0-9]{64}$/)
  })
})
