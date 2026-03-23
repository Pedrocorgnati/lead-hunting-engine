import { LeadService } from '../lead.service'

describe('LeadService', () => {
  let service: LeadService

  beforeEach(() => {
    service = new LeadService()
  })

  describe('findAll', () => {
    it('should return empty array (stub)', async () => {
      const result = await service.findAll('test-user-id', { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' })
      expect(result.data).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  describe('findById', () => {
    it('should return null (stub)', async () => {
      const result = await service.findById('test-lead-id', 'test-user-id')
      expect(result).toBeNull()
    })
  })

  describe('count', () => {
    it('should return zero counts (stub)', async () => {
      const result = await service.count('test-user-id')
      expect(result.total).toBe(0)
      expect(result.byStatus.NEW).toBe(0)
      expect(result.byTemperature.COLD).toBe(0)
    })
  })

  describe('updateStatus', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(
        service.updateStatus('lead-id', 'user-id', { status: 'CONTACTED' })
      ).rejects.toThrow('Not implemented')
    })
  })

  describe('exportCsv', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(
        service.exportCsv('user-id', { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' })
      ).rejects.toThrow('Not implemented')
    })
  })
})
