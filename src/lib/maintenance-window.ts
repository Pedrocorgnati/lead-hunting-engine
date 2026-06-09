import { getConfig, setConfig } from '@/lib/services/system-config'

export type MaintenanceSeverity = 'info' | 'warning' | 'critical'

export interface MaintenanceWindowConfig {
  enabled: boolean
  reason: string
  message: string
  severity: MaintenanceSeverity
  startsAt: string
  endsAt: string | null
  updatedAt: string
  updatedBy: string | null
  bannerPublishedAt: string | null
}

export interface PublicMaintenanceWindow {
  active: boolean
  reason: string
  message: string
  severity: MaintenanceSeverity
  startsAt: string
  endsAt: string | null
  bannerPublishedAt: string | null
  updatedAt: string
}

const DEFAULT_WINDOW: MaintenanceWindowConfig = {
  enabled: false,
  reason: '',
  message: '',
  severity: 'info',
  startsAt: new Date(0).toISOString(),
  endsAt: null,
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
  bannerPublishedAt: null,
}

export async function getMaintenanceWindowConfig(): Promise<MaintenanceWindowConfig> {
  const raw = await getConfig<Partial<MaintenanceWindowConfig>>('maintenance.window')
  return normalizeMaintenanceWindow(raw)
}

export async function saveMaintenanceWindowConfig(
  value: MaintenanceWindowConfig,
  updatedBy: string,
): Promise<MaintenanceWindowConfig> {
  const jsonValue: Record<string, string | boolean | null> = {
    enabled: value.enabled,
    reason: value.reason,
    message: value.message,
    severity: value.severity,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy,
    bannerPublishedAt: value.bannerPublishedAt,
  }
  await setConfig('maintenance.window', jsonValue, updatedBy)
  return value
}

export function normalizeMaintenanceWindow(
  raw: Partial<MaintenanceWindowConfig> | null | undefined,
): MaintenanceWindowConfig {
  return {
    ...DEFAULT_WINDOW,
    ...(raw ?? {}),
    enabled: Boolean(raw?.enabled),
    severity: isMaintenanceSeverity(raw?.severity) ? raw.severity : DEFAULT_WINDOW.severity,
    endsAt: raw?.endsAt ?? null,
    updatedBy: raw?.updatedBy ?? null,
    bannerPublishedAt: raw?.bannerPublishedAt ?? null,
  }
}

export function isMaintenanceWindowActive(
  window: MaintenanceWindowConfig,
  now = new Date(),
): boolean {
  if (!window.enabled) return false
  const startsAt = new Date(window.startsAt).getTime()
  const endsAt = window.endsAt ? new Date(window.endsAt).getTime() : Number.POSITIVE_INFINITY
  const current = now.getTime()
  return startsAt <= current && current < endsAt
}

export function toPublicMaintenanceWindow(
  window: MaintenanceWindowConfig,
  now = new Date(),
): PublicMaintenanceWindow | null {
  if (!isMaintenanceWindowActive(window, now)) return null
  return {
    active: true,
    reason: window.reason,
    message: window.message,
    severity: window.severity,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    bannerPublishedAt: window.bannerPublishedAt,
    updatedAt: window.updatedAt,
  }
}

function isMaintenanceSeverity(value: unknown): value is MaintenanceSeverity {
  return value === 'info' || value === 'warning' || value === 'critical'
}
