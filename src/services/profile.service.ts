import { prisma } from '@/lib/prisma'
import type { UpdateProfileInput } from '@/schemas/profile.schema'
import type { UserProfile } from '@prisma/client'

export class ProfileService {
  async findById(userId: string): Promise<UserProfile | null> {
    // TODO: Implementar via /auto-flow execute
    return prisma.userProfile.findUnique({ where: { id: userId } })
  }

  async update(userId: string, data: UpdateProfileInput): Promise<UserProfile> {
    // TODO: Implementar via /auto-flow execute
    void data
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async requestDeletion(userId: string): Promise<void> {
    // TODO: Implementar via /auto-flow execute
    void userId
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async exportData(userId: string) {
    // TODO: Implementar via /auto-flow execute
    void userId
    throw new Error('Not implemented - run /auto-flow execute')
  }
}

export const profileService = new ProfileService()
