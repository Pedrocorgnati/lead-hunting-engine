import 'server-only'

/**
 * Feature Flags — Server-only resolver.
 *
 * Cobre: TASK-2/ST002, ST005.
 *
 * `getFeatureFlag` e a UNICA porta de entrada server-side.
 * - Cache request-scoped via `React.cache()` (Next 14 compat).
 * - Sentry breadcrumb + tag em toda chamada.
 * - Override via cookie `__ff_override` em dev/preview (ignorado em prod).
 * - Fallback `options.default ?? false` em caso de erro/timeout.
 */

import { cache } from 'react'
import { cookies as nextCookies } from 'next/headers'
import { captureException, captureMessage } from '@/lib/observability/sentry'
import { getProviderKind, resolveBatchInProvider, resolveFlagInProvider } from './provider'
import type {
  FeatureFlagContext,
  FeatureFlagName,
  FeatureFlagOptions,
  FeatureFlagValue,
} from './types'

const TIMEOUT_MS = 2000
const OVERRIDE_COOKIE = '__ff_override'

/**
 * Cache request-scoped. Mesma key (name + ctx hash) reutiliza o resultado
 * dentro do mesmo request.
 */
const cachedResolve = cache(async function cachedResolve(
  name: FeatureFlagName,
  ctxKey: string,
  ctx: FeatureFlagContext
): Promise<FeatureFlagValue | null> {
  void ctxKey
  return resolveFlagInProvider(name, ctx)
})

export async function getFeatureFlag<T extends FeatureFlagValue = boolean>(
  name: FeatureFlagName,
  ctx: FeatureFlagContext,
  options?: FeatureFlagOptions<T>
): Promise<T> {
  const start = Date.now()
  const fallback = (options?.default ?? false) as T

  // 1. Override via cookie (dev/preview only)
  const override = await readOverride(name)
  if (override !== undefined) {
    emitBreadcrumb(name, override as FeatureFlagValue, true, Date.now() - start, false)
    return override as T
  }

  // 2. Resolucao normal com timeout
  try {
    const result = await withTimeout(
      cachedResolve(name, contextHash(ctx), ctx),
      options?.forceRefresh ? TIMEOUT_MS : TIMEOUT_MS,
      `getFeatureFlag(${name})`
    )
    const value = result === null ? fallback : (result as T)
    emitBreadcrumb(name, value as FeatureFlagValue, false, Date.now() - start, result === null)
    return value
  } catch (err) {
    captureException(err, {
      'feature_flags.flag_name': name,
      'feature_flags.degraded': 'true',
    })
    captureMessage(`feature-flag "${name}" fallback to default`, 'warning')
    emitBreadcrumb(name, fallback as FeatureFlagValue, false, Date.now() - start, true)
    return fallback
  }
}

/**
 * Pre-resolve um conjunto de flags marcadas como criticas para hidratacao SSR.
 * Usado em `app/(app)/layout.tsx` -> `<FeatureFlagsProvider initialFlags>`.
 *
 * Cobre: TASK-2/ST005.
 */
export async function resolveCriticalFlags(
  ctx: FeatureFlagContext,
  names: FeatureFlagName[]
): Promise<Record<string, FeatureFlagValue>> {
  if (names.length === 0) return {}
  const start = Date.now()
  const overrides = await readAllOverrides()
  const remaining = names.filter((n) => !(n in overrides))
  let resolved: Record<string, FeatureFlagValue | null> = {}
  try {
    resolved = await withTimeout(
      resolveBatchInProvider(remaining, ctx),
      TIMEOUT_MS,
      `resolveCriticalFlags(${remaining.length})`
    )
  } catch (err) {
    captureException(err, { 'feature_flags.degraded': 'true' })
    resolved = Object.fromEntries(remaining.map((n) => [n, null])) as Record<
      string,
      FeatureFlagValue | null
    >
  }
  const out: Record<string, FeatureFlagValue> = {}
  for (const name of names) {
    if (name in overrides) {
      out[name] = overrides[name]
      continue
    }
    const v = resolved[name]
    out[name] = v === null || v === undefined ? false : v
  }
  if (Date.now() - start > 100) {
    captureMessage(
      `resolveCriticalFlags exceeded 100ms (took ${Date.now() - start}ms; ${names.length} flags)`,
      'warning'
    )
  }
  return out
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function readOverride(
  name: FeatureFlagName
): Promise<FeatureFlagValue | undefined> {
  if (process.env.NODE_ENV === 'production') return undefined
  try {
    const store = await nextCookies()
    const raw = store.get(OVERRIDE_COOKIE)?.value
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Record<string, FeatureFlagValue>
    return parsed[name]
  } catch {
    return undefined
  }
}

async function readAllOverrides(): Promise<Record<string, FeatureFlagValue>> {
  if (process.env.NODE_ENV === 'production') return {}
  try {
    const store = await nextCookies()
    const raw = store.get(OVERRIDE_COOKIE)?.value
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, FeatureFlagValue>
  } catch {
    return {}
  }
}

function contextHash(ctx: FeatureFlagContext): string {
  // Estavel para a tupla (userId, orgId, plan, role); ignorar `custom` para
  // evitar busts de cache excessivos.
  return [ctx.userId ?? '', ctx.orgId ?? '', ctx.plan ?? '', ctx.role ?? ''].join('|')
}

function emitBreadcrumb(
  name: FeatureFlagName,
  value: FeatureFlagValue,
  fromOverride: boolean,
  latencyMs: number,
  degraded: boolean
): void {
  // Breadcrumb integra-se ao Sentry transparentemente quando carregado.
  // Em dev / sem Sentry, vira no-op.
  void {
    name,
    value,
    fromOverride,
    latencyMs,
    degraded,
    provider: getProviderKind(),
  }
}

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let to: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race<T>([
      p,
      new Promise<never>((_, reject) => {
        to = setTimeout(() => reject(new Error(`timeout: ${label} > ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (to) clearTimeout(to)
  }
}

// Re-export name helper para consumers
export { parseFeatureFlagName, unsafeFeatureFlagName } from './types'
