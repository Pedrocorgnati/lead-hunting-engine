/**
 * Feature Flags — Tipos canonicos.
 *
 * Cobre: TASK-2/ST001 (FeatureFlagName, FeatureFlagContext, FeatureFlagValue, FeatureFlagOptions).
 *
 * Convencoes:
 * - Nomenclatura padrao: `${dominio}.${modulo}.${sub-feature}` (3 partes minimas, snake_case).
 *   Ex: `fase2.outreach.whatsapp_enabled`, `system.healthcheck.echo`.
 * - Valores default: SEMPRE `false` salvo override explicito em `options.default`.
 * - Tipo branded reduz typos e erros de copia-cola.
 */

declare const FeatureFlagNameBrand: unique symbol

/**
 * Nome de flag canonico. Branded type forca uso de `parseFeatureFlagName`
 * para validar formato em tempo de execucao.
 */
export type FeatureFlagName = string & { readonly [FeatureFlagNameBrand]: true }

// Cada parte precisa ter no minimo 2 chars (uma letra + 1 [a-z0-9_]) para
// evitar nomes ambiguos como "fase2.outreach.x".
const NAME_PATTERN = /^[a-z][a-z0-9_]+\.[a-z][a-z0-9_]+\.[a-z][a-z0-9_]+$/

/**
 * Valida e retorna FeatureFlagName em runtime. Lanca em formato invalido.
 */
export function parseFeatureFlagName(input: string): FeatureFlagName {
  if (!NAME_PATTERN.test(input)) {
    throw new Error(
      `Invalid FeatureFlagName: "${input}". Expected pattern dominio.modulo.sub_feature (snake_case, 3 partes).`
    )
  }
  return input as FeatureFlagName
}

/**
 * Aceita flags formadas em runtime sem validar (usado em route handlers
 * apos validar via Zod). Trade-off: skip a validation duplicada.
 */
export function unsafeFeatureFlagName(input: string): FeatureFlagName {
  return input as FeatureFlagName
}

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue }

/**
 * Valor armazenado de uma flag.
 * - boolean -> ON/OFF (caso comum em gates)
 * - number / string -> usado para variantes (rollout pct, copy A/B)
 * - object -> config estruturada (raro)
 */
export type FeatureFlagValue = boolean | number | string | Record<string, JsonValue>

/**
 * Contexto de avaliacao de flag.
 * Permite roll-out por user/org/plan/role/email/country/custom.
 */
export interface FeatureFlagContext {
  userId?: string
  orgId?: string
  plan?: 'free' | 'pro' | 'scale'
  role?: 'ADMIN' | 'OPERATOR'
  email?: string
  country?: string
  /** Atributos arbitrarios — uso restrito (debug/A/B futuro). */
  custom?: Record<string, JsonValue>
}

export interface FeatureFlagOptions<T = boolean> {
  /** Valor retornado quando provider falha ou flag nao existe. Default: false. */
  default?: T
  /** Forca skip do cache (raro, debugging). */
  forceRefresh?: boolean
  /** TTL custom do cache request-scoped. Default: duracao do request. */
  cacheTtlMs?: number
}

/**
 * Tipos de mudanca registrados em audit.
 */
export type FeatureFlagChangeKind =
  | 'created'
  | 'updated_default'
  | 'env_value_set'
  | 'env_value_cleared'
  | 'metadata_updated'
  | 'deleted'

/**
 * Ambientes suportados.
 */
export type FeatureFlagEnv = 'development' | 'preview' | 'production'

export const SUPPORTED_ENVS: readonly FeatureFlagEnv[] = [
  'development',
  'preview',
  'production',
] as const
