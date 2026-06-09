import 'server-only'

/**
 * Feature Flags — Audit helper.
 *
 * Cobre: regra canonica de TASK-4 — toda mudanca em prod precisa audit row
 * com user, ip, reason, ua. Helper consumido pelas server actions do painel
 * admin (TASK-3) e por scripts de migration de flags.
 */

import { headers } from 'next/headers'
import { captureMessage } from '@/lib/observability/sentry'
import { recordChange } from './repo'
import type { FeatureFlagChangeKind, FeatureFlagEnv, JsonValue } from './types'

export interface AuditableUser {
  id: string
  email: string
}

export interface AuditChangeInput {
  flagId: string
  env: FeatureFlagEnv
  kind: FeatureFlagChangeKind
  beforeValue: JsonValue
  afterValue: JsonValue
  reason: string
  user: AuditableUser
  correlationId?: string
}

/**
 * Captura ip + ua atuais via `next/headers` e persiste o registro de mudanca.
 * Lanca em caso de inputs invalidos (Zod no repo).
 */
export async function auditChange(input: AuditChangeInput): Promise<{ id: string }> {
  const h = await headers()
  const xff = h.get('x-forwarded-for') ?? ''
  const ipAddress =
    xff.split(',')[0]?.trim() || h.get('x-real-ip') || h.get('cf-connecting-ip') || 'unknown'
  const userAgent = h.get('user-agent') ?? undefined

  const correlationId = input.correlationId ?? crypto.randomUUID()

  const row = await recordChange({
    flagId: input.flagId,
    env: input.env,
    kind: input.kind,
    beforeValue: input.beforeValue,
    afterValue: input.afterValue,
    reason: input.reason,
    changedBy: input.user.id,
    changedByEmail: input.user.email,
    ipAddress,
    userAgent,
    correlationId,
  })

  // Sentry sinaliza mudanca em prod para correlacionar com possivel incidente.
  if (input.env === 'production') {
    captureMessage(
      `feature-flag change [prod] kind=${input.kind} flagId=${input.flagId} by=${input.user.email}`,
      'info'
    )
  }
  return row
}
