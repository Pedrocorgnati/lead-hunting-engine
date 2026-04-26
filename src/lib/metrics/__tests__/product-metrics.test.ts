jest.mock('@/lib/prisma', () => ({
  getPrisma: jest.fn(),
}))

import {
  getFalsePositiveRate,
  getLeadsPerJob,
  getAvgCollectionTime,
  getEnrichmentCoverage,
  getProductMetrics,
} from '../product-metrics'
import { getPrisma } from '@/lib/prisma'

type MockPrisma = {
  collectionJob: { aggregate: jest.Mock; findMany: jest.Mock }
  lead: { count: jest.Mock; findMany: jest.Mock }
  // TASK-25/ST003 + R-review: getActiveOperators consulta auditLog.
  auditLog: { findMany: jest.Mock }
}

function mockPrisma(overrides: Partial<MockPrisma> = {}): MockPrisma {
  const p: MockPrisma = {
    collectionJob: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    lead: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  }
  ;(getPrisma as jest.Mock).mockReturnValue(p)
  return p
}

const USER = 'user-1'

describe('product-metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getLeadsPerJob', () => {
    it('retorna avg arredondado quando amostra >= 5', async () => {
      const p = mockPrisma()
      p.collectionJob.aggregate.mockResolvedValue({
        _avg: { resultCount: 45.678 },
        _count: { _all: 10 },
      })
      const result = await getLeadsPerJob(USER)
      expect(result).toBe(45.7)
    })

    it('retorna null quando amostra < 5 jobs', async () => {
      const p = mockPrisma()
      p.collectionJob.aggregate.mockResolvedValue({
        _avg: { resultCount: 50 },
        _count: { _all: 3 },
      })
      expect(await getLeadsPerJob(USER)).toBeNull()
    })
  })

  describe('getFalsePositiveRate', () => {
    it('retorna fracao entre 0 e 1', async () => {
      const p = mockPrisma()
      p.lead.count.mockResolvedValueOnce(100).mockResolvedValueOnce(15)
      const rate = await getFalsePositiveRate(USER)
      expect(rate).not.toBeNull()
      expect(rate!).toBeGreaterThanOrEqual(0)
      expect(rate!).toBeLessThanOrEqual(1)
      expect(rate).toBeCloseTo(0.15, 5)
    })

    it('retorna null quando total < MIN_SAMPLE_LEADS', async () => {
      const p = mockPrisma()
      p.lead.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1)
      expect(await getFalsePositiveRate(USER)).toBeNull()
    })
  })

  describe('getAvgCollectionTime', () => {
    it('calcula media em minutos', async () => {
      const p = mockPrisma()
      const base = new Date('2026-04-01T10:00:00Z')
      const jobs = Array.from({ length: 5 }, () => ({
        startedAt: base,
        completedAt: new Date(base.getTime() + 120_000),
      }))
      p.collectionJob.findMany.mockResolvedValue(jobs)
      const avg = await getAvgCollectionTime(USER)
      expect(avg).toBe(2)
    })

    it('retorna null quando jobs < MIN_SAMPLE_JOBS', async () => {
      const p = mockPrisma()
      p.collectionJob.findMany.mockResolvedValue([])
      expect(await getAvgCollectionTime(USER)).toBeNull()
    })
  })

  describe('getEnrichmentCoverage', () => {
    it('calcula fracao de leads com >=3 provenances', async () => {
      const p = mockPrisma()
      p.lead.findMany.mockResolvedValue([
        { id: '1', _count: { dataProvenance: 3 } },
        { id: '2', _count: { dataProvenance: 5 } },
        { id: '3', _count: { dataProvenance: 1 } },
        { id: '4', _count: { dataProvenance: 0 } },
        { id: '5', _count: { dataProvenance: 2 } },
      ])
      expect(await getEnrichmentCoverage(USER)).toBeCloseTo(0.4, 5)
    })

    it('retorna null quando leads < MIN_SAMPLE_LEADS', async () => {
      const p = mockPrisma()
      p.lead.findMany.mockResolvedValue([{ id: '1', _count: { dataProvenance: 3 } }])
      expect(await getEnrichmentCoverage(USER)).toBeNull()
    })
  })

  describe('getProductMetrics', () => {
    it('classifica status OK/ALERTA/SEM_DADOS para cada metrica', async () => {
      const p = mockPrisma()
      // leadsPerJob = 50 (dentro de 30-100) -> OK
      p.collectionJob.aggregate.mockResolvedValue({
        _avg: { resultCount: 50 },
        _count: { _all: 10 },
      })
      // fpRate = 25% -> ALERTA
      p.lead.count.mockResolvedValueOnce(100).mockResolvedValueOnce(25)
      // avgTime = 4 min -> OK
      const base = new Date('2026-04-01T10:00:00Z')
      p.collectionJob.findMany.mockResolvedValue(
        Array.from({ length: 5 }, () => ({
          startedAt: base,
          completedAt: new Date(base.getTime() + 4 * 60_000),
        })),
      )
      // coverage: amostra < 5 (1) -> SEM_DADOS
      p.lead.findMany.mockResolvedValue([{ id: '1', _count: { dataProvenance: 5 } }])

      const payload = await getProductMetrics(USER)
      expect(payload.leadsPerJob.status).toBe('OK')
      expect(payload.fpRate.status).toBe('ALERTA')
      expect(payload.avgCollectionTimeMin.status).toBe('OK')
      expect(payload.enrichmentCoverage.status).toBe('SEM_DADOS')
      expect(payload.windowDays).toBe(30)
    })
  })
})
