/**
 * Feature Flags — Barrel publico (server-side apenas).
 *
 * Consumers Client devem importar `./client` diretamente; este index nao
 * inclui o hook (`'use client'`) para evitar leak de boundaries.
 *
 * Cobre: TASK-2/ST009.
 */

export {
  getFeatureFlag,
  resolveCriticalFlags,
  parseFeatureFlagName,
  unsafeFeatureFlagName,
} from './server'
export type {
  FeatureFlagName,
  FeatureFlagContext,
  FeatureFlagValue,
  FeatureFlagOptions,
  FeatureFlagEnv,
  JsonValue,
} from './types'
