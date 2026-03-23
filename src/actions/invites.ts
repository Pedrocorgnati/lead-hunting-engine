import { InviteStatus, UserRole } from '@/lib/constants/enums'

export interface InviteDto {
  id: string
  email: string
  role: UserRole
  status: InviteStatus
  expiresAt: string | null
  createdAt: string
}

export interface AuditLogEntry {
  id: string
  action: string
  performedBy: string | null
  ipAddress: string | null
  createdAt: string
}

// TODO: Implementar backend — run /auto-flow execute
export async function getInvites(): Promise<InviteDto[]> {
  return []
}

// TODO: Implementar backend — run /auto-flow execute
export async function createInvite(_data: {
  email: string
  role: UserRole
}): Promise<{ id: string }> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function resendInvite(_id: string): Promise<{ success: boolean }> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function revokeInvite(_id: string): Promise<{ success: boolean }> {
  throw new Error('Not implemented - run /auto-flow execute')
}

// TODO: Implementar backend — run /auto-flow execute
export async function getAuditLog(): Promise<AuditLogEntry[]> {
  return []
}
