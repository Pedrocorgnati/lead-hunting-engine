const mockFindUnique = jest.fn()
const mockUpdate = jest.fn()
const mockAuditLog = jest.fn()
const mockCollectionJobFindMany = jest.fn()
const mockLeadFindMany = jest.fn()
const mockRawLeadDataFindMany = jest.fn()
const mockPitchTemplateFindMany = jest.fn()
const mockAuditLogFindMany = jest.fn()
const mockInviteFindMany = jest.fn()
const mockContactEventFindMany = jest.fn()
const mockLeadTagFindMany = jest.fn()
const mockSavedViewFindMany = jest.fn()
const mockNotificationFindMany = jest.fn()
const mockNotificationPreferenceFindMany = jest.fn()
const mockPushSubscriptionFindMany = jest.fn()
const mockLoginAttemptFindMany = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    userProfile: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
    collectionJob: { findMany: mockCollectionJobFindMany },
    lead: { findMany: mockLeadFindMany },
    rawLeadData: { findMany: mockRawLeadDataFindMany },
    pitchTemplate: { findMany: mockPitchTemplateFindMany },
    auditLog: { findMany: mockAuditLogFindMany },
    invite: { findMany: mockInviteFindMany },
    contactEvent: { findMany: mockContactEventFindMany },
    leadTag: { findMany: mockLeadTagFindMany },
    savedView: { findMany: mockSavedViewFindMany },
    notification: { findMany: mockNotificationFindMany },
    notificationPreference: { findMany: mockNotificationPreferenceFindMany },
    pushSubscription: { findMany: mockPushSubscriptionFindMany },
    loginAttempt: { findMany: mockLoginAttemptFindMany },
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
    const baseProfile = {
      id: 'user-id',
      email: 'test@test.com',
      name: 'Test',
      role: 'OPERATOR',
      avatarUrl: null,
      termsAcceptedAt: null,
      deletionRequestedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }

    function primeAllFindMany() {
      mockCollectionJobFindMany.mockResolvedValueOnce([])
      mockLeadFindMany.mockResolvedValueOnce([])
      mockRawLeadDataFindMany.mockResolvedValueOnce([])
      mockPitchTemplateFindMany.mockResolvedValueOnce([])
      mockAuditLogFindMany.mockResolvedValueOnce([])
      mockInviteFindMany.mockResolvedValueOnce([])
      mockContactEventFindMany.mockResolvedValueOnce([])
      mockLeadTagFindMany.mockResolvedValueOnce([])
      mockSavedViewFindMany.mockResolvedValueOnce([])
      mockNotificationFindMany.mockResolvedValueOnce([])
      mockNotificationPreferenceFindMany.mockResolvedValueOnce([])
      mockPushSubscriptionFindMany.mockResolvedValueOnce([])
      mockLoginAttemptFindMany.mockResolvedValueOnce([])
    }

    it('should throw NOT_FOUND when profile missing', async () => {
      mockFindUnique.mockResolvedValueOnce(null)
      const err = await service.exportData('user-id').catch((e) => e)
      expect(err).toBeInstanceOf(ProfileError)
      expect(err.type).toBe('NOT_FOUND')
    })

    it('should return DSAR JSON with expected top-level keys', async () => {
      mockFindUnique.mockResolvedValueOnce(baseProfile)
      primeAllFindMany()
      mockAuditLog.mockResolvedValueOnce(undefined)

      const result = await service.exportData('user-id', '127.0.0.1')

      expect(result.version).toBe('1.0')
      expect(typeof result.exported_at).toBe('string')
      expect(result.user?.id).toBe('user-id')
      expect(result.user?.email).toBe('test@test.com')
      expect(Array.isArray(result.collection_jobs)).toBe(true)
      expect(Array.isArray(result.leads)).toBe(true)
      expect(Array.isArray(result.audit_logs)).toBe(true)
      expect(result.row_counts).toEqual(
        expect.objectContaining({ leads: 0, collection_jobs: 0, audit_logs: 0 })
      )
    })

    it('should log profile.data_exported audit event with row counts', async () => {
      mockFindUnique.mockResolvedValueOnce(baseProfile)
      primeAllFindMany()
      mockAuditLog.mockResolvedValueOnce(undefined)

      await service.exportData('user-id', '127.0.0.1')

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'profile.data_exported',
          userId: 'user-id',
          resource: 'user_profiles',
          resourceId: 'user-id',
          ipAddress: '127.0.0.1',
          metadata: expect.objectContaining({
            leads: 0,
            collection_jobs: 0,
          }),
        })
      )
    })
  })
})
