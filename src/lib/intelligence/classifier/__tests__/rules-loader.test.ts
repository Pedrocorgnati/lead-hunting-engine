jest.mock('@/lib/prisma', () => ({
  prisma: { classificationRule: { findMany: jest.fn() } },
}))

import { loadClassificationRules, invalidateClassificationRulesCache } from '../rules-loader'
import { prisma } from '@/lib/prisma'

const findMany = (prisma as unknown as { classificationRule: { findMany: jest.Mock } })
  .classificationRule.findMany

beforeEach(() => {
  jest.clearAllMocks()
  invalidateClassificationRulesCache()
})

describe('loadClassificationRules', () => {
  it('mapeia linhas do banco para ClassificationRuleConfig', async () => {
    findMany.mockResolvedValue([
      { opportunityType: 'A_NEEDS_SITE', minScore: 75, maxScore: 100, requiredSignals: ['no-site'] },
      { opportunityType: 'E_SCALE', minScore: 0, maxScore: 74, requiredSignals: [] },
    ])
    const rules = await loadClassificationRules()
    expect(rules).toHaveLength(2)
    expect(rules?.[0]).toMatchObject({ opportunityType: 'A_NEEDS_SITE', minScore: 75, maxScore: 100 })
  })

  it('retorna undefined (defaults assumem) quando a tabela esta vazia', async () => {
    findMany.mockResolvedValue([])
    expect(await loadClassificationRules()).toBeUndefined()
  })

  it('retorna undefined em erro de leitura (fail-open, coleta nao para)', async () => {
    findMany.mockRejectedValue(new Error('db down'))
    expect(await loadClassificationRules()).toBeUndefined()
  })

  it('cacheia por TTL e invalida via invalidateClassificationRulesCache', async () => {
    findMany.mockResolvedValue([
      { opportunityType: 'A_NEEDS_SITE', minScore: 80, maxScore: 100, requiredSignals: [] },
    ])
    await loadClassificationRules()
    await loadClassificationRules()
    expect(findMany).toHaveBeenCalledTimes(1)

    invalidateClassificationRulesCache()
    await loadClassificationRules()
    expect(findMany).toHaveBeenCalledTimes(2)
  })
})
