import 'server-only'

/**
 * Feature Flags — Provider singleton.
 *
 * Cobre: TASK-1/ST004 (provider lib).
 *
 * Decisao ADR-0042: provider local Postgres-backed. A leitura passa
 * por `repo.ts` (CRUD Prisma), e este arquivo apenas encapsula:
 * - selecao de provider via env (`FEATURE_FLAGS_PROVIDER`),
 * - healthcheck (latencia + acesso ao DB),
 * - hash determinista para rollout gradual (`% 100 < rollout_pct`).
 *
 * Trocar provider no futuro = reescrever este arquivo mantendo
 * a assinatura publica intacta. Os consumidores (server.ts/client.ts)
 * NAO importam provider diretamente — usam getFeatureFlag/useFeatureFlag.
 */

import { createHash } from 'node:crypto'
import { findFlag, getEnvValue, listAllForResolve } from './repo'
import type {
  FeatureFlagContext,
  FeatureFlagEnv,
  FeatureFlagName,
  FeatureFlagValue,
} from './types'

export type ProviderKind = 'local' | 'noop'

const PROVIDER_KIND: ProviderKind = (() => {
  const v = (process.env.FEATURE_FLAGS_PROVIDER ?? 'local').toLowerCase()
  return v === 'noop' ? 'noop' : 'local'
})()

const HEALTH_FLAG_NAME = 'system.healthcheck.echo'

export function getProviderKind(): ProviderKind {
  return PROVIDER_KIND
}

export function getCurrentEnv(): FeatureFlagEnv {
  const node = process.env.NODE_ENV
  const vercel = process.env.VERCEL_ENV
  if (vercel === 'production' || node === 'production') return 'production'
  if (vercel === 'preview') return 'preview'
  return 'development'
}

/**
 * Avalia uma flag para um contexto. Retorna `null` quando inexistente
 * (server.ts decide o default). Boolean inclui rollout-gradual via hash.
 */
export async function resolveFlagInProvider(
  name: FeatureFlagName,
  ctx: FeatureFlagContext
): Promise<FeatureFlagValue | null> {
  if (PROVIDER_KIND === 'noop') return null

  const flag = await findFlag(name)
  if (!flag) return null

  const envValue = await getEnvValue(flag.id, getCurrentEnv())

  // Sem override por env: usa default
  if (envValue === undefined || envValue === null) {
    return flag.defaultValue as FeatureFlagValue
  }

  // Rollout gradual: se valor e objeto { rollout_pct, target_value }, hashing determinista.
  if (
    envValue !== null &&
    typeof envValue === 'object' &&
    !Array.isArray(envValue) &&
    'rollout_pct' in envValue &&
    'target_value' in envValue
  ) {
    const rolloutPct = Number((envValue as Record<string, unknown>).rollout_pct ?? 0)
    const target = (envValue as Record<string, unknown>).target_value as FeatureFlagValue
    const otherwise =
      ((envValue as Record<string, unknown>).fallback_value as FeatureFlagValue | undefined) ??
      (flag.defaultValue as FeatureFlagValue)

    if (rolloutPct >= 100) return target
    if (rolloutPct <= 0) return otherwise
    const bucket = computeRolloutBucket(name, ctx)
    return bucket < rolloutPct ? target : otherwise
  }

  return envValue as FeatureFlagValue
}

/**
 * Resolve um conjunto de flags em batch (TASK-2/ST005, ST006).
 * Util para hidratacao SSR.
 */
export async function resolveBatchInProvider(
  names: FeatureFlagName[],
  ctx: FeatureFlagContext
): Promise<Record<string, FeatureFlagValue | null>> {
  if (PROVIDER_KIND === 'noop') {
    return Object.fromEntries(names.map((n) => [n, null]))
  }
  const flags = await listAllForResolve(names)
  const env = getCurrentEnv()
  const result: Record<string, FeatureFlagValue | null> = {}
  for (const name of names) {
    const flag = flags.find((f) => f.name === name)
    if (!flag) {
      result[name] = null
      continue
    }
    const envValue = flag.envValues[env]
    if (envValue === undefined || envValue === null) {
      result[name] = flag.defaultValue as FeatureFlagValue
    } else if (
      typeof envValue === 'object' &&
      envValue !== null &&
      !Array.isArray(envValue) &&
      'rollout_pct' in (envValue as Record<string, unknown>)
    ) {
      const rolloutPct = Number((envValue as Record<string, unknown>).rollout_pct ?? 0)
      const target = (envValue as Record<string, unknown>).target_value as FeatureFlagValue
      const fallback =
        ((envValue as Record<string, unknown>).fallback_value as FeatureFlagValue | undefined) ??
        (flag.defaultValue as FeatureFlagValue)
      if (rolloutPct >= 100) result[name] = target
      else if (rolloutPct <= 0) result[name] = fallback
      else {
        const bucket = computeRolloutBucket(name as FeatureFlagName, ctx)
        result[name] = bucket < rolloutPct ? target : fallback
      }
    } else {
      result[name] = envValue as FeatureFlagValue
    }
  }
  return result
}

/**
 * Healthcheck: garante que a flag canonica `system.healthcheck.echo`
 * esta presente e retorna latencia ms.
 */
export async function probeProviderHealth(): Promise<{
  status: 'ok' | 'down'
  provider: ProviderKind
  latencyMs: number
  error?: string
}> {
  const start = Date.now()
  const provider = PROVIDER_KIND
  if (provider === 'noop') {
    return { status: 'ok', provider, latencyMs: 0 }
  }
  try {
    const flag = await findFlag(HEALTH_FLAG_NAME as FeatureFlagName)
    const latencyMs = Date.now() - start
    if (!flag) {
      return {
        status: 'down',
        provider,
        latencyMs,
        error: `flag canonica "${HEALTH_FLAG_NAME}" nao encontrada (rodar seed)`,
      }
    }
    return { status: 'ok', provider, latencyMs }
  } catch (err) {
    return {
      status: 'down',
      provider,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Bucket determinista para rollout gradual.
 * Mesmo (flag, userId/orgId) sempre cai no mesmo bucket.
 */
function computeRolloutBucket(name: FeatureFlagName, ctx: FeatureFlagContext): number {
  const subject = ctx.userId ?? ctx.orgId ?? ctx.email ?? 'anonymous'
  const hash = createHash('sha256').update(`${name}:${subject}`).digest('hex')
  // Pega 8 primeiros hex chars -> int -> mod 100
  const n = parseInt(hash.slice(0, 8), 16)
  return n % 100
}
