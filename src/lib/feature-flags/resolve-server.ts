/**
 * Feature Flags — Resolver server-side para RSC.
 *
 * Cobre: TASK-5/ST002 (CL-565).
 *
 * `resolveFlagServer` e a porta de entrada para Server Components que precisam
 * de feature flags sem adicionar um fetch extra (zero roundtrip).
 *
 * - Cache request-scoped via `React.cache` (Next 14+): mesma flag/userId
 *   reutiliza o resultado dentro do mesmo request.
 * - Override via cookie `ff_override` em dev/preview (ignorado em prod).
 * - Fallback: false em caso de erro.
 */

import 'server-only'
import { cache } from 'react'
import { cookies as nextCookies } from 'next/headers'
import { parseOverrideCookie, isOverrideAllowed } from './cookie-override'
import { resolveFlagInProvider } from './provider'
import type { FeatureFlagName, FeatureFlagValue } from './types'

const OVERRIDE_COOKIE = 'ff_override'

const cachedResolveFlagServer = cache(async function _resolve(
  key: FeatureFlagName,
  userId?: string
): Promise<boolean> {
  // 1. Tentar override via cookie (apenas staging/dev)
  if (isOverrideAllowed()) {
    const store = await nextCookies()
    const raw = store.get(OVERRIDE_COOKIE)?.value
    const overrides = parseOverrideCookie(raw)
    if (key in overrides) return overrides[key]
  }

  // 2. Resolver no provider (Prisma direto)
  try {
    const ctx = userId ? { userId } : {}
    const value = await resolveFlagInProvider(key, ctx)
    if (value === null || value === undefined) return false
    if (typeof value === 'boolean') return value
    return Boolean(value)
  } catch {
    return false
  }
})

/**
 * Resolve uma feature flag server-side.
 * Seguro para uso em Server Components e Server Actions.
 *
 * @example
 *   const enabled = await resolveFlagServer(parseFeatureFlagName('fase2.dashboard.new_ui'))
 */
export async function resolveFlagServer(
  key: FeatureFlagName,
  userId?: string
): Promise<boolean> {
  return cachedResolveFlagServer(key, userId)
}
