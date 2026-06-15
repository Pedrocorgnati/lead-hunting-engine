import 'server-only'

/**
 * outreach-engine (brainstorm 06-10, tasks 07/10 — F-10): supressao
 * operacional por e-mail/dominio.
 *
 * Regras:
 *  - Checada SEMPRE antes de qualquer envio (worker outreach-send).
 *  - cooldownUntil null = supressao permanente; com data = bloqueio ate la.
 *  - Contingencia 9.1 do fonte: se a checagem de supressao FALHAR
 *    (infra indisponivel), o chamador deve tratar como "nao seguro" e
 *    forcar DRY_RUN — por isso checkSuppression retorna `available:false`
 *    em erro, nunca lanca.
 */
import { prisma } from '@/lib/prisma'
import type { SuppressionKind, SuppressionReason } from '@prisma/client'
import { toE164 } from './phone-utils'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Normaliza o `value` da supressao conforme o tipo (e-mail, telefone E.164, etc). */
function normalizeSuppressionValue(kind: SuppressionKind, value: string): string {
  if (kind === 'EMAIL') return normalizeEmail(value)
  if (kind === 'PHONE') return toE164(value) ?? value.replace(/\D/g, '')
  return value.trim().toLowerCase()
}

export function extractDomain(email: string): string | null {
  const normalized = normalizeEmail(email)
  const at = normalized.lastIndexOf('@')
  if (at <= 0 || at === normalized.length - 1) return null
  return normalized.slice(at + 1)
}

export interface SuppressionCheck {
  /** Infra de supressao respondeu? false => contingencia 9.1: DRY_RUN. */
  available: boolean
  suppressed: boolean
  kind?: SuppressionKind
  reason?: SuppressionReason
  cooldownUntil?: Date | null
}

/**
 * Verifica supressao por e-mail exato e por dominio. Cooldown expirado nao
 * bloqueia (entrada permanece para trilha, mas deixa de suprimir).
 */
export async function checkSuppression(email: string, now: Date = new Date()): Promise<SuppressionCheck> {
  const value = normalizeEmail(email)
  const domain = extractDomain(email)
  try {
    const entries = await prisma.suppressionEntry.findMany({
      where: {
        OR: [
          { kind: 'EMAIL', value },
          ...(domain ? [{ kind: 'DOMAIN' as SuppressionKind, value: domain }] : []),
        ],
      },
    })
    for (const entry of entries) {
      const active = entry.cooldownUntil === null || entry.cooldownUntil > now
      if (active) {
        return {
          available: true,
          suppressed: true,
          kind: entry.kind,
          reason: entry.reason,
          cooldownUntil: entry.cooldownUntil,
        }
      }
    }
    return { available: true, suppressed: false }
  } catch {
    // Infra indisponivel: o chamador DEVE degradar para DRY_RUN (9.1).
    return { available: false, suppressed: false }
  }
}

export interface AddSuppressionInput {
  kind: SuppressionKind
  value: string
  reason: SuppressionReason
  source?: string
  /** Horas de cooldown; ausente = permanente. */
  cooldownHours?: number
  notes?: string
  createdBy?: string
}

/** Upsert idempotente — re-supressao atualiza motivo/cooldown. */
export async function addSuppression(input: AddSuppressionInput): Promise<{ id: string }> {
  const value = normalizeSuppressionValue(input.kind, input.value)
  const cooldownUntil =
    input.cooldownHours !== undefined
      ? new Date(Date.now() + input.cooldownHours * 60 * 60 * 1000)
      : null
  const row = await prisma.suppressionEntry.upsert({
    where: { kind_value: { kind: input.kind, value } },
    create: {
      kind: input.kind,
      value,
      reason: input.reason,
      source: input.source,
      cooldownUntil,
      notes: input.notes,
      createdBy: input.createdBy,
    },
    update: {
      reason: input.reason,
      source: input.source,
      cooldownUntil,
      notes: input.notes,
    },
    select: { id: true },
  })
  return { id: row.id }
}

export async function removeSuppression(kind: SuppressionKind, value: string): Promise<boolean> {
  const normalized = normalizeSuppressionValue(kind, value)
  const res = await prisma.suppressionEntry.deleteMany({ where: { kind, value: normalized } })
  return res.count > 0
}

/**
 * Supressao por telefone (contato direto WhatsApp/ligacao): "nao perturbe".
 * Normaliza para E.164 antes de checar. Infra indisponivel => available=false
 * (o chamador decide; aqui nao bloqueia para nao travar o worklist manual).
 */
export async function checkPhoneSuppression(phone: string, now: Date = new Date()): Promise<SuppressionCheck> {
  const value = toE164(phone)
  if (!value) return { available: true, suppressed: false }
  try {
    const entries = await prisma.suppressionEntry.findMany({ where: { kind: 'PHONE', value } })
    for (const entry of entries) {
      const active = entry.cooldownUntil === null || entry.cooldownUntil > now
      if (active) {
        return { available: true, suppressed: true, kind: entry.kind, reason: entry.reason, cooldownUntil: entry.cooldownUntil }
      }
    }
    return { available: true, suppressed: false }
  } catch {
    return { available: false, suppressed: false }
  }
}

/**
 * Probe de saude da infra de supressao (preflight task 01/31): a tabela
 * responde? Sem isso o pipeline inteiro fica em DRY_RUN (9.1).
 */
export async function suppressionInfraHealthy(): Promise<boolean> {
  try {
    await prisma.suppressionEntry.count()
    return true
  } catch {
    return false
  }
}
