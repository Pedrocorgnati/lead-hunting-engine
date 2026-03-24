import { prisma } from '@/lib/prisma'
import { AuditService } from '@/lib/services/audit-service'
import type { UpdateProfileInput } from '@/schemas/profile.schema'
import type { UserProfile } from '@prisma/client'

export class ProfileError extends Error {
  type: 'NOT_FOUND' | 'DUPLICATE_DELETION'
  constructor(type: 'NOT_FOUND' | 'DUPLICATE_DELETION') {
    super(type)
    this.type = type
    this.name = 'ProfileError'
  }
}

export class ProfileService {
  async findById(userId: string): Promise<UserProfile | null> {
    return prisma.userProfile.findUnique({ where: { id: userId } })
  }

  async update(userId: string, data: UpdateProfileInput): Promise<UserProfile> {
    const profile = await this.findById(userId)
    if (!profile) throw new ProfileError('NOT_FOUND')

    return prisma.userProfile.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      },
    })
  }

  async requestDeletion(userId: string, ipAddress?: string): Promise<void> {
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { deletionRequestedAt: true },
    })

    if (!profile) throw new ProfileError('NOT_FOUND')
    if (profile.deletionRequestedAt) throw new ProfileError('DUPLICATE_DELETION')

    await prisma.userProfile.update({
      where: { id: userId },
      data: { deletionRequestedAt: new Date() },
    })

    await AuditService.log({
      userId,
      action: 'user.deletion_requested',
      resource: 'user_profiles',
      resourceId: userId,
      metadata: { requested_at: new Date().toISOString() },
      ipAddress,
    })
  }

  async exportData(userId: string) {
    void userId
    throw new Error('Not implemented - run /auto-flow execute')
  }
}

export const profileService = new ProfileService()
