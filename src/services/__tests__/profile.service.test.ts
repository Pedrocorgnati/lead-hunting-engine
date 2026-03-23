import { ProfileService } from '../profile.service'

describe('ProfileService', () => {
  let service: ProfileService

  beforeEach(() => {
    service = new ProfileService()
  })

  describe('update', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(
        service.update('user-id', { name: 'Test' })
      ).rejects.toThrow('Not implemented')
    })
  })

  describe('requestDeletion', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(service.requestDeletion('user-id')).rejects.toThrow('Not implemented')
    })
  })

  describe('exportData', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(service.exportData('user-id')).rejects.toThrow('Not implemented')
    })
  })
})
