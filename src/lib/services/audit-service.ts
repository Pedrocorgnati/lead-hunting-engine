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
  | 'user.role_changed'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'job.retried'
  | 'credential.expiring_notified'
  | 'lead.score_recomputed'
  | 'lead.tags_updated'
  | 'lead.notes_updated'
  | 'lead.attachment_added'
  | 'lead.attachment_deleted'
  | 'lead.exported'
  // TASK-4 intake-review (CL-467, CL-474): sessao invalidada
  | 'session.invalidated_by_password_change'
  | 'session.invalidated_by_admin'
  // TASK-2/TASK-3 intake-review (landing admin)
  | 'waitlist.invited'
  | 'waitlist.rejected'
  | 'contact.replied'
  | 'contact.archived'
  // TASK-5 intake-review (CL-482): admin export do audit log
  | 'audit_log.exported'
  // TASK-7 intake-review (CL-473): admin forca troca de senha
  | 'admin.force_password_reset'
  | 'forced_password_reset_completed'
  // TASK-9 intake-review (CL-223..226): dedup resolver
  | 'lead.duplicates_merged'
  | 'lead.duplicates_kept_both'
  | 'lead.duplicates_rejected'
  | 'lead.duplicates_undo_merge'
  // TASK-13 intake-review: admin altera thresholds de alerta
  | 'admin.alerts_thresholds_updated'
  // TASK-23 intake-review (CL-079): admin copia valor de credencial via opaque token
  | 'ADMIN_CREDENTIAL_COPIED'

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
        console.error('[AuditService] Falha ao registrar log')
      }
    }
  }
}
