import { InviteService } from '../invite.service'

describe('InviteService', () => {
  let service: InviteService

  beforeEach(() => {
    service = new InviteService()
  })

  describe('findAll', () => {
    it('should return empty result (stub)', async () => {
      const result = await service.findAll()
      expect(result.data).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  describe('findByToken', () => {
    it('should return null (stub)', async () => {
      const result = await service.findByToken('test-token')
      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(
        service.create({ email: 'test@test.com', role: 'OPERATOR', expiresInDays: 7 }, 'admin-id')
      ).rejects.toThrow('Not implemented')
    })
  })
})
