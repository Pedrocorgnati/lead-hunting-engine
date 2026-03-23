import { JobService } from '../job.service'

describe('JobService', () => {
  let service: JobService

  beforeEach(() => {
    service = new JobService()
  })

  describe('findAllByUser', () => {
    it('should return empty array (stub)', async () => {
      const result = await service.findAllByUser('test-user-id')
      expect(result).toEqual([])
    })
  })

  describe('create', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(
        service.create(
          { city: 'São Paulo', niche: 'restaurantes', sources: ['GOOGLE_MAPS'] },
          'user-id'
        )
      ).rejects.toThrow('Not implemented')
    })
  })

  describe('getStatus', () => {
    it('should return null (stub)', async () => {
      const result = await service.getStatus('job-id', 'user-id')
      expect(result).toBeNull()
    })
  })

  describe('countConcurrent', () => {
    it('should return 0 (stub)', async () => {
      const result = await service.countConcurrent('user-id')
      expect(result).toBe(0)
    })
  })
})
