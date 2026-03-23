import type { CreateInviteInput, ActivateAccountInput } from '@/schemas/invite.schema'
import type { Invite } from '@prisma/client'

export class InviteService {
  async findAll(filters?: { page?: number; limit?: number }): Promise<{ data: Invite[]; total: number }> {
    // TODO: Implementar via /auto-flow execute
    void filters
    return { data: [], total: 0 }
  }

  async create(data: CreateInviteInput, invitedById: string): Promise<Invite> {
    // TODO: Implementar via /auto-flow execute
    void data
    void invitedById
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async findByToken(token: string): Promise<{ email: string; role: string; expiresAt: Date } | null> {
    // TODO: Implementar via /auto-flow execute
    void token
    return null
  }

  async activate(token: string, data: ActivateAccountInput) {
    // TODO: Implementar via /auto-flow execute
    void token
    void data
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async resend(inviteId: string): Promise<Invite> {
    // TODO: Implementar via /auto-flow execute
    void inviteId
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async revoke(inviteId: string): Promise<void> {
    // TODO: Implementar via /auto-flow execute
    void inviteId
    throw new Error('Not implemented - run /auto-flow execute')
  }
}

export const inviteService = new InviteService()
