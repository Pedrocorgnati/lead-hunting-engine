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
  // M14-G-006/G-019: NPS in-app
  | 'nps.enabled'
  | 'nps.min_days_active'
  | 'nps.min_leads_collected'
  | 'nps.response_cooldown_days'
  | 'nps.pilot_only'
  | 'maintenance.window'
  // outreach-engine (brainstorm 06-10): gates operacionais de cold-outbound.
  // kill_switch: enabled=false e o estado seguro — NENHUM envio sai com a
  // chave desligada (task 01/11). dry_run: simulacao sem envio real
  // (contingencia 9.1). Demais chaves: janela, limiares, gates por mercado,
  // drift pause, qualidade de dados, SLA, A/B e throttle adaptativo.
  | 'outreach.kill_switch'
  | 'outreach.dry_run'
  | 'outreach.send_window'
  | 'outreach.thresholds'
  | 'outreach.market_gates'
  | 'outreach.drift'
  | 'outreach.quality_gate'
  | 'outreach.sla'
  | 'outreach.ab_testing'
  | 'outreach.throttle_state'
  | 'outreach.phase_flags'
  | 'outreach.owners'
  | 'outreach.preflight'
  // throttle anti-duplo-clique do envio de teste manual (test-send)
  | 'outreach.test_send_throttle'
  // perfil do remetente p/ alimentar {{meu_*}} dos pitch templates
  | 'outreach.sender_profile'
  // task 03: retencao explicita da fila local (done/failed)
  | 'queue.retention'
  // task 25 (F-01): scheduler recorrente de radar
  | 'radar.recurrence'
  // task 27 (F-25): gate automatico de qualidade por provider
  | 'providers.quality_gate'

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
  'nps.enabled': { value: true },
  'nps.min_days_active': { value: 7 },
  'nps.min_leads_collected': { value: 3 },
  'nps.response_cooldown_days': { value: 90 },
  'nps.pilot_only': { value: false },
  'maintenance.window': { enabled: false },
  // Estado seguro por default: kill_switch desligado = zero envio real.
  'outreach.kill_switch': { enabled: false },
  'outreach.dry_run': { enabled: true },
  'outreach.send_window': { start: '09:00', end: '18:00', timezone: 'America/Sao_Paulo' },
  'outreach.thresholds': {
    maxBounceRate: 0.05,
    minSampleForBounceRate: 20,
    domainCooldownHours: 72,
    emailCooldownHours: 168,
    failureBaselineMultiplier: 3,
    domainDailyCap: 5,
  },
  'outreach.market_gates': { allowed: ['BR'], requireApproval: [], defaultPolicy: 'require_approval' },
  'outreach.drift': {
    enabled: true,
    windowMinutes: 60,
    maxErrorRate: 0.2,
    maxBounceRate: 0.08,
    maxInvalidContactRate: 0.15,
    minVolume: 10,
  },
  'outreach.quality_gate': { minIntegrityScore: 60, blockGenericEmail: false },
  'outreach.sla': { defaultHours: 24 },
  'outreach.ab_testing': { minSamplePerVariant: 200, significanceLevel: 0.05, ratifiedBy: null },
  'outreach.throttle_state': { drainBatchSize: 10, slowdownFactor: 1, slowdownUntil: null },
  'outreach.phase_flags': { phase0: true, phase1: false, phase2: false, phase3: false },
  'outreach.owners': {
    kill_switch: 'operador-humano',
    campaign_approval: 'operador-humano',
    market_gate: 'operador-humano',
    suppression: 'engine',
    drift_pause: 'engine',
    anti_bounce: 'engine',
    replay: 'operador-humano',
    rollback: 'operador-humano',
  },
  'outreach.preflight': { lastRunAt: null, passed: false, items: [] },
  'outreach.test_send_throttle': { lastAt: null },
  'outreach.sender_profile': { name: 'Pedro Corgnati', company: '', whatsapp: '', portfolio: 'https://corgnati.com' },
  'queue.retention': { doneDays: 14, failedDays: 30 },
  'radar.recurrence': { enabled: false, cadenceHours: 168, maxJobsPerRun: 3 },
  'providers.quality_gate': { enabled: true, minUsefulRate: 0.1, minSample: 25, autoDegrade: true },
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

/**
 * Leitura SEM cache — para chaves safety-critical (kill_switch, dry_run)
 * onde a latencia de 30s do cache por processo e inaceitavel num kill
 * de emergencia (gotcha documentado: multi-replica + worker container).
 */
export async function getConfigFresh<T = Prisma.JsonValue>(
  key: SystemConfigKey
): Promise<T> {
  const row = await prisma.systemConfig.findUnique({ where: { key } })
  const value = (row?.value ?? DEFAULTS[key]) as Prisma.JsonValue
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value as T
}

// ── outreach-engine (brainstorm 06-10): getters tipados ──────────────────

export interface OutreachKillSwitch {
  enabled: boolean
}

export interface OutreachSendWindow {
  start: string
  end: string
  timezone: string
}

export interface OutreachThresholds {
  maxBounceRate: number
  minSampleForBounceRate: number
  domainCooldownHours: number
  emailCooldownHours: number
  failureBaselineMultiplier: number
  domainDailyCap: number
}

export interface OutreachMarketGates {
  allowed: string[]
  requireApproval: string[]
  defaultPolicy: 'allow' | 'block' | 'require_approval'
}

export interface QueueRetention {
  doneDays: number
  failedDays: number
}

/** Kill switch global: enabled=false (estado seguro) bloqueia TODO envio. Sem cache. */
export async function getOutreachKillSwitch(): Promise<OutreachKillSwitch> {
  const v = await getConfigFresh<Partial<OutreachKillSwitch>>('outreach.kill_switch')
  return { enabled: v.enabled === true }
}

/** Dry-run global: enabled=true simula envio sem contato externo. Sem cache. */
export async function getOutreachDryRun(): Promise<{ enabled: boolean }> {
  const v = await getConfigFresh<{ enabled?: boolean }>('outreach.dry_run')
  // Fail-safe: qualquer shape inesperado vira dry_run ativo.
  return { enabled: v.enabled !== false }
}

export async function getOutreachSendWindow(): Promise<OutreachSendWindow> {
  const v = await getConfig<Partial<OutreachSendWindow>>('outreach.send_window')
  return {
    start: typeof v.start === 'string' ? v.start : '09:00',
    end: typeof v.end === 'string' ? v.end : '18:00',
    timezone: typeof v.timezone === 'string' ? v.timezone : 'America/Sao_Paulo',
  }
}

export async function getOutreachThresholds(): Promise<OutreachThresholds> {
  const d = DEFAULTS['outreach.thresholds'] as unknown as OutreachThresholds
  const v = await getConfig<Partial<OutreachThresholds>>('outreach.thresholds')
  return {
    maxBounceRate: Number(v.maxBounceRate ?? d.maxBounceRate),
    minSampleForBounceRate: Number(v.minSampleForBounceRate ?? d.minSampleForBounceRate),
    domainCooldownHours: Number(v.domainCooldownHours ?? d.domainCooldownHours),
    emailCooldownHours: Number(v.emailCooldownHours ?? d.emailCooldownHours),
    failureBaselineMultiplier: Number(v.failureBaselineMultiplier ?? d.failureBaselineMultiplier),
    domainDailyCap: Number(v.domainDailyCap ?? d.domainDailyCap),
  }
}

export async function getOutreachMarketGates(): Promise<OutreachMarketGates> {
  const v = await getConfig<Partial<OutreachMarketGates>>('outreach.market_gates')
  return {
    allowed: Array.isArray(v.allowed) ? v.allowed : ['BR'],
    requireApproval: Array.isArray(v.requireApproval) ? v.requireApproval : [],
    defaultPolicy:
      v.defaultPolicy === 'allow' || v.defaultPolicy === 'block'
        ? v.defaultPolicy
        : 'require_approval',
  }
}

export async function getQueueRetention(): Promise<QueueRetention> {
  const v = await getConfig<Partial<QueueRetention>>('queue.retention')
  return {
    doneDays: Number(v.doneDays ?? 14),
    failedDays: Number(v.failedDays ?? 30),
  }
}

/** Testing only. */
export function _clearSystemConfigCache(): void {
  cache.clear()
}
