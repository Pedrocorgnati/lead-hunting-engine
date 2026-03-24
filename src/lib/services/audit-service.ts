import { prisma } from '@/lib/prisma'

export type AuditAction =
  | 'invite.created'
  | 'invite.revoked'
  | 'invite.resent'
  | 'terms.accepted'
  | 'credential.created'
  | 'credential.updated'
  | 'credential.deleted'
  | 'scoring_rule.updated'
  | 'scoring_rule.reset'
  | 'user.deletion_requested'
  | 'lead.status_changed'
  | 'lead.false_positive'
  | 'collection.started'
  | 'collection.cancelled'
  | 'user.profile_updated'
  | 'AUTH_LOGOUT'
  | 'AUTH_SIGNUP'
  | 'AUTH_SIGNUP_ADMIN'

interface AuditLogParams {
  userId?: string
  action: AuditAction
  resource: string
  resourceId?: string
  metadata?: Record<string, string | number | boolean | null>
  ipAddress?: string
}

export class AuditService {
  static async log(params: AuditLogParams): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          resource: params.resource,
          resourceId: params.resourceId,
          metadata: params.metadata ?? {},
          ipAddress: params.ipAddress,
        },
      })
    } catch {
      // Audit log failure must never break the main operation (COMP-001)
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('[AuditService] Falha ao registrar log')
      }
    }
  }
}
