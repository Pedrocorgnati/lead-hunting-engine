export type MaintenanceSeverity = 'info' | 'warning' | 'critical'

export interface PublicMaintenanceWindow {
  active: true
  reason: string
  message: string
  severity: MaintenanceSeverity
  startsAt: string
  endsAt: string | null
  bannerPublishedAt: string | null
  updatedAt: string
}

export interface PublicMaintenanceWindowState {
  active: boolean
  window: PublicMaintenanceWindow | null
}

export const MAINTENANCE_STATUS_URL = 'https://status.lead-hunting.engine'

export function parsePublicMaintenanceWindowResponse(
  payload: unknown,
): PublicMaintenanceWindowState {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error('Payload de manutenção inválido.')
  }

  const active = Boolean(payload.data.active)
  const windowPayload = payload.data.window

  if (!active || windowPayload === null) {
    return { active: false, window: null }
  }

  if (!isRecord(windowPayload)) {
    throw new Error('Janela de manutenção inválida.')
  }

  const reason = readRequiredString(windowPayload.reason, 'reason')
  const message = readRequiredString(windowPayload.message, 'message')
  const startsAt = readRequiredIsoString(windowPayload.startsAt, 'startsAt')
  const updatedAt = readRequiredIsoString(windowPayload.updatedAt, 'updatedAt')
  const endsAt = readNullableIsoString(windowPayload.endsAt, 'endsAt')
  const bannerPublishedAt = readNullableIsoString(
    windowPayload.bannerPublishedAt,
    'bannerPublishedAt',
  )

  return {
    active: true,
    window: {
      active: true,
      reason,
      message,
      severity: normalizeSeverity(windowPayload.severity),
      startsAt,
      endsAt,
      bannerPublishedAt,
      updatedAt,
    },
  }
}

export function getMaintenanceWindowSignature(window: PublicMaintenanceWindow): string {
  return `${window.startsAt}:${window.updatedAt}`
}

export function isMaintenanceWindowExpired(
  window: PublicMaintenanceWindow,
  now = Date.now(),
): boolean {
  return Boolean(window.endsAt && new Date(window.endsAt).getTime() <= now)
}

export function formatMaintenancePeriod(window: PublicMaintenanceWindow): string {
  const startsAt = formatDateTime(window.startsAt)
  const endsAt = window.endsAt ? formatDateTime(window.endsAt) : null

  if (startsAt && endsAt) return `${startsAt} até ${endsAt}`
  if (startsAt) return `Desde ${startsAt}`
  if (endsAt) return `Até ${endsAt}`
  return 'Janela de manutenção ativa'
}

export function formatMaintenanceCountdown(endsAt: string | null, now = Date.now()): string | null {
  if (!endsAt) return null

  const remaining = new Date(endsAt).getTime() - now
  if (remaining <= 0) return 'Expirando agora'

  const totalSeconds = Math.ceil(remaining / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}min restantes`
  }

  if (minutes > 0) {
    return `${minutes}min ${seconds.toString().padStart(2, '0')}s restantes`
  }

  return `${seconds}s restantes`
}

function normalizeSeverity(value: unknown): MaintenanceSeverity {
  if (value === 'warning' || value === 'critical' || value === 'info') {
    return value
  }

  return 'info'
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Campo obrigatório ausente: ${field}.`)
  }

  return value
}

function readRequiredIsoString(value: unknown, field: string): string {
  const text = readRequiredString(value, field)
  if (Number.isNaN(new Date(text).getTime())) {
    throw new Error(`Data inválida: ${field}.`)
  }

  return text
}

function readNullableIsoString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) {
    throw new Error(`Data inválida: ${field}.`)
  }

  return value
}

function formatDateTime(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
