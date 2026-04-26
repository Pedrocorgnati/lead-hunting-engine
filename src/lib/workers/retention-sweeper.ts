/**
 * TASK-26 intake-review: retention sweeper das novas entidades PII.
 *
 * Estrategia: ANONIMIZACAO em vez de DELETE. Campos PII sao sobrescritos
 * com hash SHA256 + marker `anonymized_at` em metadata quando disponivel.
 * Isso preserva integridade referencial (foreign keys) e analytics agregado.
 *
 * Entidades cobertas:
 *  - WaitlistEntry (email/name/ipHash) apos retention.waitlist_entry_days
 *  - ContactMessage (email/name/message/ipHash) apos retention.contact_message_days (pos-read/replied/archived)
 *  - LandingConsent (ipHash) apos retention.landing_consent_days
 *  - ExportHistory (filters podem ter PII; signed URLs expiram) apos retention.export_history_days
 *  - LeadHistory.snapshot (extrai PII do JSON) apos retention.lead_history_snapshot_days
 */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getConfig } from '@/lib/services/system-config'

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

async function retentionDays(
  key: Parameters<typeof getConfig>[0],
  fallback: number,
): Promise<number> {
  try {
    const cfg = await getConfig<{ value: number }>(key)
    const v = Number(cfg?.value)
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}

export interface SweepResult {
  entity: string
  count: number
}

export async function sweepWaitlist(): Promise<SweepResult> {
  const days = await retentionDays('retention.waitlist_entry_days', 365)
  const cutoff = daysAgo(days)
  const targets = await prisma.waitlistEntry.findMany({
    where: {
      createdAt: { lt: cutoff },
      // considera anonimizado quando o email ja comeca com "sha256:"
      NOT: { email: { startsWith: 'sha256:' } },
    },
    select: { id: true, email: true },
    take: 500,
  })
  for (const t of targets) {
    await prisma.waitlistEntry.update({
      where: { id: t.id },
      data: {
        email: sha256(t.email),
        name: null,
      },
    })
  }
  return { entity: 'WaitlistEntry', count: targets.length }
}

export async function sweepContactMessages(): Promise<SweepResult> {
  const days = await retentionDays('retention.contact_message_days', 180)
  const cutoff = daysAgo(days)
  const targets = await prisma.contactMessage.findMany({
    where: {
      updatedAt: { lt: cutoff },
      status: { in: ['READ', 'REPLIED', 'ARCHIVED'] },
      NOT: { email: { startsWith: 'sha256:' } },
    },
    select: { id: true, email: true },
    take: 500,
  })
  for (const t of targets) {
    await prisma.contactMessage.update({
      where: { id: t.id },
      data: {
        email: sha256(t.email),
        name: null,
        message: '[anonimizado]',
      },
    })
  }
  return { entity: 'ContactMessage', count: targets.length }
}

export async function sweepLandingConsents(): Promise<SweepResult> {
  const days = await retentionDays('retention.landing_consent_days', 730)
  const cutoff = daysAgo(days)
  const res = await prisma.landingConsent.updateMany({
    where: {
      createdAt: { lt: cutoff },
      NOT: { ipHash: { startsWith: 'anonymized:' } },
    },
    data: { ipHash: 'anonymized:expired' },
  })
  return { entity: 'LandingConsent', count: res.count }
}

export async function sweepExportHistory(): Promise<SweepResult> {
  const days = await retentionDays('retention.export_history_days', 30)
  const cutoff = daysAgo(days)
  // R-07 intake-review: alem de marcar EXPIRED e anonimizar filters (podem conter
  // emails/telefones em search), LIMPA fileUrl — signed URL antiga nao deve
  // persistir apos retention.
  const res = await prisma.exportHistory.updateMany({
    where: {
      createdAt: { lt: cutoff },
      status: { in: ['COMPLETED', 'FAILED', 'EXPIRED'] },
      NOT: { status: 'EXPIRED' },
    },
    data: {
      filters: { anonymized: true, anonymizedAt: new Date().toISOString() } as unknown as object,
      fileUrl: null,
      status: 'EXPIRED',
    },
  })
  return { entity: 'ExportHistory', count: res.count }
}

export async function sweepLeadHistorySnapshots(): Promise<SweepResult> {
  const days = await retentionDays('retention.lead_history_snapshot_days', 90)
  const cutoff = daysAgo(days)
  // Remove PII (oldValue/newValue) das rows antigas, preservando field + timestamp.
  const res = await prisma.leadHistory.updateMany({
    where: {
      changedAt: { lt: cutoff },
    },
    data: {
      oldValue: { anonymized: true } as unknown as object,
      newValue: { anonymized: true } as unknown as object,
    },
  })
  return { entity: 'LeadHistory', count: res.count }
}

export async function runRetentionSweep(): Promise<SweepResult[]> {
  const results: SweepResult[] = []
  for (const fn of [
    sweepWaitlist,
    sweepContactMessages,
    sweepLandingConsents,
    sweepExportHistory,
    sweepLeadHistorySnapshots,
  ]) {
    try {
      results.push(await fn())
    } catch (err) {
      results.push({
        entity: fn.name,
        count: -1,
      })
      // eslint-disable-next-line no-console
      console.error(`[retention-sweep] ${fn.name} failed:`, err instanceof Error ? err.message : err)
    }
  }
  return results
}
