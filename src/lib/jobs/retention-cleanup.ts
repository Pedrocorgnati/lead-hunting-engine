import { prisma } from '@/lib/prisma'
import { captureException, captureMessage } from '@/lib/observability/sentry'

export interface RetentionCleanupResult {
  deleted: number
  rawDeleted: number
  executedAt: Date
  durationMs: number
}

export async function runRetentionCleanup(): Promise<RetentionCleanupResult> {
  const startedAt = Date.now()
  const now = new Date()

  try {
    const [{ count: deleted }, { count: rawDeleted }] = await Promise.all([
      prisma.lead.deleteMany({
        where: { retentionUntil: { lt: now } },
      }),
      prisma.rawLeadData.deleteMany({
        where: { retentionUntil: { lt: now } },
      }),
    ])

    const durationMs = Date.now() - startedAt

    await prisma.auditLog.create({
      data: {
        action: 'RETENTION_CLEANUP',
        resource: 'lead',
        metadata: {
          deleted,
          rawDeleted,
          executedAt: now.toISOString(),
          durationMs,
        },
      },
    })

    captureMessage(
      `retention.cleanup.ok deleted=${deleted} rawDeleted=${rawDeleted} durationMs=${durationMs}`,
      'info'
    )

    return { deleted, rawDeleted, executedAt: now, durationMs }
  } catch (error) {
    captureException(error, { job: 'retention-cleanup' })
    throw error
  }
}
