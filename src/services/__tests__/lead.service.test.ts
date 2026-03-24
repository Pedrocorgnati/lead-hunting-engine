jest.mock('@/lib/prisma', () => ({
  prisma: {
    lead: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      groupBy: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
  },
}))

import { LeadService } from '../lead.service'

describe('LeadService', () => {
  let service: LeadService

  beforeEach(() => {
    service = new LeadService()
    jest.clearAllMocks()
  })

  describe('findAll', () => {
    it('should return empty array when no leads', async () => {
      const result = await service.findAll('test-user-id', { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' })
      expect(result.data).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  describe('findById', () => {
    it('should return null when lead not found', async () => {
      const result = await service.findById('test-lead-id', 'test-user-id')
      expect(result).toBeNull()
    })
  })

  describe('count', () => {
    it('should return zero counts when no leads', async () => {
      const result = await service.count('test-user-id')
      expect(result.total).toBe(0)
      expect(result.byStatus.NEW).toBe(0)
      expect(result.byTemperature.COLD).toBe(0)
    })
  })

  describe('updateStatus', () => {
    it('should throw when lead not found', async () => {
      await expect(
        service.updateStatus('lead-id', 'user-id', { status: 'CONTACTED' })
      ).rejects.toThrow('Lead não encontrado.')
    })
  })

  describe('exportCsv', () => {
    it('should return CSV string with column headers', async () => {
      const result = await service.exportCsv('user-id', { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' })
      expect(typeof result).toBe('string')
      expect(result).toContain('ID')
      expect(result).toContain('Nome')
    })
  })
})
