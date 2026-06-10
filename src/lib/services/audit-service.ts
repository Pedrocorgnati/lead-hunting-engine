import { prisma } from '@/lib/prisma'

export type AuditAction =
  | 'invite.created'
  | 'invite.revoked'
  | 'invite.resent'
  | 'terms.accepted'
  | 'credential.created'
  | 'credential.updated'
  | 'credential.deleted'
  // A15: hardening operacional de credenciais (rotate, revoke, test-history)
  | 'credential.rotated'
  | 'credential.revoked'
  | 'credential.tested'
  | 'scoring_rule.updated'
  | 'scoring_rule.reset'
  | 'user.deletion_requested'
  | 'user.deletion_cancelled'
  // M3-G03: DSAR (LGPD Art. 18 V) — exportacao de dados pessoais
  | 'profile.data_exported'
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
  | 'session.revoke_all'
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
  // REMEDIATION M3-G02: hard-delete pos-15d via cron LGPD
  | 'lgpd.hard_delete'
  | 'user.deletion_completed'
  // M14-G-006: NPS in-app
  | 'nps.submitted'
  // M14-G-010: cohort piloto via tags do usuario
  | 'user.tags_updated'
  // intake-review TASK-4 (CL-038, CL-041): trilha completa de autenticacao
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  // Loop A9: janela de manutencao administravel e banner publico.
  | 'maintenance.window_activated'
  | 'maintenance.window_deactivated'
  | 'maintenance.window_scheduled'
  | 'maintenance.window_cancelled'
  | 'maintenance.banner_published'
  // Task 56 / C6: programa piloto admin (cohort por tags + entrevistas)
  | 'pilot.cohort_added'
  | 'pilot.cohort_removed'
  | 'pilot.interview_scheduled'
  | 'pilot.report_exported'
  // Task 32 / B7: recuperacao de erros de coleta (retry/ignore/export reais)
  | 'collection_error.retried'
  | 'collection_error.retried_all'
  | 'collection_error.ignored'
  | 'collection_error.exported'
  // Task 36 / B11: gestao do historico de exportacoes (A17)
  | 'export.deleted'
  | 'export.regenerated'
  // Tasks 46/49 / AD29: administracao de cron jobs
  | 'cron.triggered_manually'
  | 'cron.paused'
  | 'cron.resumed'
  // Task 45 / AD30: lifecycle de alertas operacionais
  | 'alert.silenced'
  | 'alert.resolved'
  | 'alert.reopened'

interface AuditLogParams {
  userId?: string
  action: AuditAction
  resource: string
  resourceId?: string
  metadata?: Record<string, string | number | boolean | null>
  ipAddress?: string
  userAgent?: string
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
          metadata: {
            ...(params.metadata ?? {}),
            ...(params.userAgent ? { userAgent: params.userAgent } : {}),
          },
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
