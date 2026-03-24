const mockFindUnique = jest.fn()
const mockUpdate = jest.fn()
const mockAuditLog = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    userProfile: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}))

jest.mock('@/lib/services/audit-service', () => ({
  AuditService: {
    log: mockAuditLog,
  },
}))

import { ProfileService, ProfileError } from '../profile.service'

describe('ProfileService', () => {
  let service: ProfileService

  beforeEach(() => {
    service = new ProfileService()
    jest.clearAllMocks()
  })

  describe('update', () => {
    it('should update profile name', async () => {
      const mockProfile = { id: 'user-id', name: 'Old Name', email: 'test@test.com', role: 'OPERATOR' }
      mockFindUnique.mockResolvedValueOnce(mockProfile)
      mockUpdate.mockResolvedValueOnce({ ...mockProfile, name: 'New Name' })

      const result = await service.update('user-id', { name: 'New Name' })
      expect(result.name).toBe('New Name')
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { name: 'New Name' },
      })
    })

    it('should throw ProfileError NOT_FOUND when profile missing', async () => {
      mockFindUnique.mockResolvedValueOnce(null)

      await expect(service.update('user-id', { name: 'Test' })).rejects.toBeInstanceOf(ProfileError)
      const err = await service.update('user-id', { name: 'Test' }).catch(e => e)
      expect(err.type).toBe('NOT_FOUND')
    })
  })

  describe('requestDeletion', () => {
    it('should set deletionRequestedAt and log audit', async () => {
      mockFindUnique.mockResolvedValueOnce({ deletionRequestedAt: null })
      mockUpdate.mockResolvedValueOnce({})
      mockAuditLog.mockResolvedValueOnce(undefined)

      await service.requestDeletion('user-id', '192.168.1.1')

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { deletionRequestedAt: expect.any(Date) },
      })
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.deletion_requested',
          userId: 'user-id',
          resource: 'user_profiles',
          resourceId: 'user-id',
          ipAddress: '192.168.1.1',
        })
      )
    })

    it('should throw ProfileError DUPLICATE_DELETION when already requested', async () => {
      mockFindUnique.mockResolvedValueOnce({ deletionRequestedAt: new Date() })

      const err = await service.requestDeletion('user-id').catch(e => e)
      expect(err).toBeInstanceOf(ProfileError)
      expect(err.type).toBe('DUPLICATE_DELETION')
    })

    it('should throw ProfileError NOT_FOUND when profile missing', async () => {
      mockFindUnique.mockResolvedValueOnce(null)

      const err = await service.requestDeletion('user-id').catch(e => e)
      expect(err).toBeInstanceOf(ProfileError)
      expect(err.type).toBe('NOT_FOUND')
    })
  })

  describe('exportData', () => {
    it('should throw Not implemented (stub)', async () => {
      await expect(service.exportData('user-id')).rejects.toThrow('Not implemented')
    })
  })
})
