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

export interface TelemetryEvent {
  kind: TelemetryEventKind
  correlationId: string
  userId: string | null
  resourceId?: string
  resourceType?: string
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
