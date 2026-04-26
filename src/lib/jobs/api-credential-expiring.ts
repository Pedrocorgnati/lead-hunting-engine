import { prisma } from '@/lib/prisma'
import { dispatcher } from '@/lib/notifications/dispatcher'
import { AuditService } from '@/lib/services/audit-service'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export interface CredentialExpiringResult {
  checked: number
  notified: number
  skipped: number
}

/**
 * Varre ApiCredential com expiresAt dentro de 7 dias e dispara CREDENTIAL_EXPIRING
 * para todos os admins. Idempotente por 24h via `expiringNotifiedAt`.
 */
export async function runCredentialExpiringJob(now: Date = new Date()): Promise<CredentialExpiringResult> {
  const horizon = new Date(now.getTime() + SEVEN_DAYS_MS)

  const credentials = await prisma.apiCredential.findMany({
    where: {
      isActive: true,
      expiresAt: { gte: now, lte: horizon },
    },
    select: { id: true, provider: true, expiresAt: true, expiringNotifiedAt: true },
  })

  const admins = await prisma.userProfile.findMany({
    where: { role: 'ADMIN', deactivatedAt: null },
    select: { id: true },
  })

  let notified = 0
  let skipped = 0

  for (const cred of credentials) {
    const notifiedRecently =
      cred.expiringNotifiedAt &&
      now.getTime() - cred.expiringNotifiedAt.getTime() < 24 * 60 * 60 * 1000

    if (notifiedRecently) {
      skipped++
      continue
    }

    const daysLeft = Math.max(
      0,
      Math.ceil(((cred.expiresAt?.getTime() ?? now.getTime()) - now.getTime()) / (24 * 60 * 60 * 1000)),
    )

    for (const admin of admins) {
      await dispatcher.dispatch({
        event: 'CREDENTIAL_EXPIRING',
        userId: admin.id,
        params: { provider: cred.provider, daysLeft },
      })
    }

    await prisma.apiCredential.update({
      where: { id: cred.id },
      data: { expiringNotifiedAt: now },
    })

    await AuditService.log({
      action: 'credential.expiring_notified',
      resource: 'api_credential',
      resourceId: cred.id,
      metadata: { provider: cred.provider, daysLeft },
    })

    notified++
  }

  return { checked: credentials.length, notified, skipped }
}
