/**
 * Feature Flags — Cookie override para staging/dev.
 *
 * Cobre: TASK-5/ST001 (CL-565).
 *
 * Cookie `ff_override` (JSON { "flag_key": true|false }) sobrescreve a resolucao
 * de flags em ambientes nao-produtivos. Em producao, retorna sempre {}.
 *
 * Gate de producao: `isOverrideAllowed()` — modulo puro, testavel sem Next.js.
 */

import { z } from 'zod'

const OverrideSchema = z.record(z.string(), z.boolean())

/**
 * Verifica se o override via cookie e permitido no ambiente atual.
 * Retorna false em producao (nao importa o cookie).
 */
export function isOverrideAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  if (process.env.FLAG_OVERRIDE_ENABLED === 'true') return true
  return true
}

/**
 * Faz parse do valor raw do cookie `ff_override`.
 * Retorna {} em caso de erro ou quando override nao e permitido.
 */
export function parseOverrideCookie(value: string | undefined): Record<string, boolean> {
  if (!value) return {}
  if (!isOverrideAllowed()) return {}
  try {
    const parsed = JSON.parse(decodeURIComponent(value))
    const result = OverrideSchema.safeParse(parsed)
    return result.success ? result.data : {}
  } catch {
    return {}
  }
}
