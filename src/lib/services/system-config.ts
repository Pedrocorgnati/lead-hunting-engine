/**
 * SystemConfig service — chave/valor persistente para ajustes operacionais
 * sem redeploy (thresholds de alerta, limites de export, flags).
 *
 * Origem: TASK-13 intake-review / ST002 (CL-124); tambem consumido por
 * TASK-22 (export.sync_max_rows, export.signed_url_ttl_hours).
 *
 * Convencoes de chave (namespaced):
 *   - alert.llm.monthly_usd       -> { threshold: number }
 *   - alert.api.daily_calls       -> { threshold: number }
 *   - alert.job.stuck_minutes     -> { threshold: number }
 *   - export.sync_max_rows        -> { value: number }
 *   - export.signed_url_ttl_hours -> { value: number }
 *
 * Defaults em codigo (DEFAULTS) garantem funcionamento mesmo antes de
 * rodar o seed da migration (failsafe para dev).
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export type SystemConfigKey =
  | 'alert.llm.monthly_usd'
  | 'alert.api.daily_calls'
  | 'alert.job.stuck_minutes'
  | 'export.sync_max_rows'
  | 'export.signed_url_ttl_hours'
  // TASK-26 intake-review: retention policy por entidade PII
  | 'retention.waitlist_entry_days'
  | 'retention.contact_message_days'
  | 'retention.landing_consent_days'
  | 'retention.export_history_days'
  | 'retention.lead_history_snapshot_days'

export const DEFAULTS: Record<SystemConfigKey, Prisma.JsonValue> = {
  'alert.llm.monthly_usd': { threshold: 50 },
  'alert.api.daily_calls': { threshold: 10_000 },
  'alert.job.stuck_minutes': { threshold: 15 },
  'export.sync_max_rows': { value: 500 },
  'export.signed_url_ttl_hours': { value: 24 },
  'retention.waitlist_entry_days': { value: 365 },
  'retention.contact_message_days': { value: 180 },
  'retention.landing_consent_days': { value: 730 },
  'retention.export_history_days': { value: 30 },
  'retention.lead_history_snapshot_days': { value: 90 },
}

// Cache em-memoria com TTL curto para reduzir queries em cron/hot-paths.
const CACHE_TTL_MS = 30_000
const cache = new Map<string, { value: Prisma.JsonValue; expiresAt: number }>()

function invalidate(key: string): void {
  cache.delete(key)
}

export async function getConfig<T = Prisma.JsonValue>(
  key: SystemConfigKey
): Promise<T> {
  const cached = cache.get(key)
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.value as T

  const row = await prisma.systemConfig.findUnique({ where: { key } })
  const value = (row?.value ?? DEFAULTS[key]) as Prisma.JsonValue
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS })
  return value as T
}

export async function setConfig(
  key: SystemConfigKey,
  value: Prisma.JsonValue,
  updatedBy?: string
): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, updatedBy },
    update: { value: value as Prisma.InputJsonValue, updatedBy },
  })
  invalidate(key)
}

export async function getAllAlertThresholds(): Promise<{
  llmMonthlyUsd: number
  apiDailyCalls: number
  jobStuckMinutes: number
}> {
  const [llm, api, job] = await Promise.all([
    getConfig<{ threshold: number }>('alert.llm.monthly_usd'),
    getConfig<{ threshold: number }>('alert.api.daily_calls'),
    getConfig<{ threshold: number }>('alert.job.stuck_minutes'),
  ])
  return {
    llmMonthlyUsd: Number(llm.threshold ?? DEFAULTS['alert.llm.monthly_usd']),
    apiDailyCalls: Number(api.threshold ?? DEFAULTS['alert.api.daily_calls']),
    jobStuckMinutes: Number(job.threshold ?? DEFAULTS['alert.job.stuck_minutes']),
  }
}

export async function getExportSettings(): Promise<{
  syncMaxRows: number
  signedUrlTtlHours: number
}> {
  const [sync, ttl] = await Promise.all([
    getConfig<{ value: number }>('export.sync_max_rows'),
    getConfig<{ value: number }>('export.signed_url_ttl_hours'),
  ])
  return {
    syncMaxRows: Number(sync.value ?? 500),
    signedUrlTtlHours: Number(ttl.value ?? 24),
  }
}

/** Testing only. */
export function _clearSystemConfigCache(): void {
  cache.clear()
}
