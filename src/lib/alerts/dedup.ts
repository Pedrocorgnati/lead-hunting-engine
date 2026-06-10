/**
 * Dedup de alertas — garante que um alerta de uma mesma regra so e disparado
 * uma vez por dia. Usa UNIQUE(rule, dayKey) do `sent_alerts`.
 *
 * Origem: TASK-13 intake-review / ST003.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Tenta registrar o alerta. Retorna `true` se inserido (pode disparar),
 * `false` se duplicado (ja existe para o dia).
 *
 * `meta.severity`/`meta.message` alimentam o lifecycle exibido em
 * AD30 /admin/alertas (Task 45).
 */
export async function claimAlertSlot(
  rule: string,
  payload?: Record<string, unknown>,
  when: Date = new Date(),
  meta?: { severity?: 'critical' | 'high' | 'medium' | 'low'; message?: string }
): Promise<boolean> {
  try {
    await prisma.sentAlert.create({
      data: {
        rule,
        dayKey: dayKey(when),
        payload: (payload ?? {}) as Prisma.InputJsonValue,
        severity: meta?.severity ?? 'medium',
        message: meta?.message ?? null,
      },
    })
    return true
  } catch (err) {
    // Unique constraint violation -> ja disparado hoje
    const code = (err as { code?: string }).code
    if (code === 'P2002') return false
    throw err
  }
}
