/**
 * telemetry.ts — Zero Silencio / ECU: rastreia eventos de fluxo do usuario.
 *
 * Registra eventos consultaveis com correlationId, sem vazar segredos.
 * Usado por operadores, admin e fluxos de recuperacao (C14.1-C14.3).
 */

import { prisma } from '@/lib/prisma'

export type TelemetryEventKind =
  | 'collection.started'
  | 'collection.completed'
  | 'collection.failed'
  | 'collection.cancelled'
  | 'lead.viewed'
  | 'lead.status_changed'
  | 'lead.exported'
  | 'admin.provider.pause'
  | 'admin.provider.resume'
  | 'admin.provider.force_fallback'
  | 'admin.credential.test'
  | 'admin.flag.toggled'
  | 'recovery.password.reset'
  | 'recovery.provider.fallback'
  | 'error.silent_detected'
  // C14.2: fluxos do operador (gerar pitch, acompanhar job, abandono)
  | 'pitch.generated'
  | 'pitch.failed'
  | 'job.followed'
  | 'flow.abandoned'
  | 'flow.completed'
  // C14.3: admin/cron/manutencao + notificacoes
  | 'notification.dispatched'
  | 'cron.executed'
  | 'maintenance.toggled'
  // outreach-engine (brainstorm 06-10): trilha de pre-checagem, envio,
  // supressao, resposta, replay e governanca (tasks 01/04/09/12/13/17).
  | 'outreach.preflight'
  | 'outreach.dispatched'
  | 'outreach.sent'
  | 'outreach.failed'
  | 'outreach.suppressed'
  | 'outreach.bounced'
  | 'outreach.reply_received'
  | 'outreach.sequence_paused'
  | 'outreach.replayed'
  | 'outreach.campaign_paused'
  | 'outreach.killswitch_toggled'
  | 'outreach.rollback'
  // envio de teste manual do operador (pro proprio email; fora do funil)
  | 'outreach.test_send'
  // task 04/15: falha de job com reason_code + alarme de fila parada
  | 'queue.job_failed'
  | 'queue.stalled'
  // task 25 (F-01): recoleta recorrente de radar
  | 'radar.recollect'

/** Lista runtime dos kinds (consultas do relatorio ECU + validacao do endpoint). */
export const TELEMETRY_KINDS: TelemetryEventKind[] = [
  'collection.started', 'collection.completed', 'collection.failed', 'collection.cancelled',
  'lead.viewed', 'lead.status_changed', 'lead.exported',
  'admin.provider.pause', 'admin.provider.resume', 'admin.provider.force_fallback',
  'admin.credential.test', 'admin.flag.toggled',
  'recovery.password.reset', 'recovery.provider.fallback', 'error.silent_detected',
  'pitch.generated', 'pitch.failed', 'job.followed', 'flow.abandoned', 'flow.completed',
  'notification.dispatched', 'cron.executed', 'maintenance.toggled',
  'outreach.preflight', 'outreach.dispatched', 'outreach.sent', 'outreach.failed',
  'outreach.suppressed', 'outreach.bounced', 'outreach.reply_received',
  'outreach.sequence_paused', 'outreach.replayed', 'outreach.campaign_paused',
  'outreach.killswitch_toggled', 'outreach.rollback', 'outreach.test_send',
  'queue.job_failed', 'queue.stalled', 'radar.recollect',
]

/** Severidade derivada por classe de evento (relatorio ECU C14.4). */
export function telemetrySeverity(kind: TelemetryEventKind): 'error' | 'warning' | 'info' {
  if (kind === 'collection.failed' || kind === 'pitch.failed' || kind === 'error.silent_detected') return 'error'
  if (kind === 'outreach.failed' || kind === 'queue.job_failed') return 'error'
  if (kind === 'flow.abandoned' || kind === 'recovery.provider.fallback' || kind === 'recovery.password.reset') return 'warning'
  if (
    kind === 'outreach.bounced' ||
    kind === 'outreach.suppressed' ||
    kind === 'outreach.sequence_paused' ||
    kind === 'outreach.campaign_paused' ||
    kind === 'outreach.rollback' ||
    kind === 'queue.stalled'
  ) {
    return 'warning'
  }
  return 'info'
}

export interface TelemetryEvent {
  kind: TelemetryEventKind
  correlationId: string
  userId: string | null
  resourceId?: string
  resourceType?: string
  /** Rota da app onde o evento ocorreu (C14.2: eventos associados a rota). */
  route?: string
  metadata?: Record<string, unknown>
}

const MASKED_KEYS = /password|secret|token|key|auth|credential|bearer/i

function maskMetadata(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, MASKED_KEYS.test(k) ? '[REDACTED]' : v]),
  )
}

export async function track(event: TelemetryEvent): Promise<void> {
  const safeMetadata = event.metadata ? maskMetadata(event.metadata) : undefined

  try {
    await prisma.auditLog.create({
      data: {
        userId: event.userId,
        action: event.kind,
        resource: event.resourceType ?? 'telemetry',
        resourceId: event.resourceId ?? null,
        metadata: {
          correlationId: event.correlationId,
          telemetry: true,
          severity: telemetrySeverity(event.kind),
          ...(event.route ? { route: event.route } : {}),
          ...(safeMetadata ?? {}),
        },
      },
    })
  } catch {
    // Nao bloquear fluxo principal se telemetria falhar.
  }
}

export function makeCorrelationId(prefix = 'tel'): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}:${id}`
}
