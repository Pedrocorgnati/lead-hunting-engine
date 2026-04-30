import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException, captureMessage } from '@/lib/observability/sentry'

/**
 * LGPD hard-delete job (REMEDIATION M3-G02).
 *
 * Janela legal de 15 dias: usuarios que solicitaram exclusao
 * (`UserProfile.deletionRequestedAt`) e ja passaram do cutoff
 * sao definitivamente removidos do sistema.
 *
 * Ordem de operacoes por usuario (cada um em try/catch isolado
 * para nao quebrar o batch):
 *  1. Anonimiza `audit_logs.userId` (set null) preservando trilha
 *     de acoes/recursos para fins SOX/auditoria.
 *  2. `prisma.userProfile.delete()` — cascade automatico cuida das
 *     7 relacoes com `onDelete: Cascade` configuradas no schema.
 *  3. Supabase Admin API `auth.admin.deleteUser(userId)` remove o
 *     registro de `auth.users`.
 *  4. Log final em audit com action `'lgpd.hard_delete'`.
 */

const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000

export interface LgpdRetentionFailure {
  userId: string
  reason: string
}

export interface LgpdRetentionCleanupResult {
  candidates: number
  processed: number
  authDeleted: number
  auditAnonymized: number
  errors: LgpdRetentionFailure[]
  executedAt: Date
  durationMs: number
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email).digest('hex')
}

export async function runLgpdRetentionCleanup(): Promise<LgpdRetentionCleanupResult> {
  const startedAt = Date.now()
  const executedAt = new Date()
  const cutoff = new Date(Date.now() - FIFTEEN_DAYS_MS)

  const errors: LgpdRetentionFailure[] = []
  let processed = 0
  let authDeleted = 0
  let auditAnonymized = 0

  try {
    const candidates = await prisma.userProfile.findMany({
      where: { deletionRequestedAt: { lt: cutoff } },
      select: { id: true, email: true, deletionRequestedAt: true },
    })

    if (candidates.length === 0) {
      const durationMs = Date.now() - startedAt
      captureMessage(
        `lgpd.hard_delete.ok candidates=0 durationMs=${durationMs}`,
        'info'
      )
      return {
        candidates: 0,
        processed: 0,
        authDeleted: 0,
        auditAnonymized: 0,
        errors,
        executedAt,
        durationMs,
      }
    }

    const supabase = createAdminClient()

    for (const candidate of candidates) {
      const { id: userId, email, deletionRequestedAt } = candidate
      try {
        const anonymized = await prisma.$transaction(async (tx) => {
          const updated = await tx.auditLog.updateMany({
            where: { userId },
            data: { userId: null },
          })
          await tx.userProfile.delete({ where: { id: userId } })
          return updated.count
        })

        auditAnonymized += anonymized

        const { error: authError } = await supabase.auth.admin.deleteUser(userId)
        if (authError) {
          // Nao reverte o delete cascade do Prisma — usuario ja foi removido
          // do banco; registramos para reconciliacao manual em PENDING-ACTIONS.
          captureException(authError, {
            job: 'lgpd-retention-cleanup',
            userId,
            stage: 'supabase.auth.admin.deleteUser',
          })
          errors.push({
            userId,
            reason: `supabase_auth_delete_failed: ${authError.message}`,
          })
        } else {
          authDeleted += 1
        }

        await prisma.auditLog.create({
          data: {
            action: 'lgpd.hard_delete',
            resource: 'user_profile',
            resourceId: userId,
            metadata: {
              originalEmailHash: hashEmail(email),
              deletionRequestedAt: deletionRequestedAt
                ? deletionRequestedAt.toISOString()
                : null,
              executedAt: executedAt.toISOString(),
              auditAnonymizedCount: anonymized,
              authDeleted: !authError,
            },
          },
        })

        processed += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        captureException(error, {
          job: 'lgpd-retention-cleanup',
          userId,
          stage: 'cascade-delete',
        })
        errors.push({ userId, reason: message })
      }
    }

    const durationMs = Date.now() - startedAt

    captureMessage(
      `lgpd.hard_delete.ok candidates=${candidates.length} processed=${processed} authDeleted=${authDeleted} auditAnonymized=${auditAnonymized} errors=${errors.length} durationMs=${durationMs}`,
      errors.length > 0 ? 'warning' : 'info'
    )

    return {
      candidates: candidates.length,
      processed,
      authDeleted,
      auditAnonymized,
      errors,
      executedAt,
      durationMs,
    }
  } catch (error) {
    captureException(error, { job: 'lgpd-retention-cleanup' })
    throw error
  }
}
