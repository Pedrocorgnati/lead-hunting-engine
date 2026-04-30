'use client'

/**
 * Feature Flags — Hook client-side.
 *
 * Cobre: TASK-2/ST003.
 *
 * Le valores ja resolvidos pelo Server Component via FeatureFlagsProvider
 * (Context). Nao faz round-trip — defaults aplicam imediatamente, evitando
 * flicker.
 */

import { useContext } from 'react'
import { FeatureFlagsContext } from '@/components/providers/FeatureFlagsProvider'
import type { FeatureFlagName, FeatureFlagOptions, FeatureFlagValue } from './types'

export interface UseFeatureFlagResult<T extends FeatureFlagValue> {
  value: T
  isLoading: boolean
  error: Error | null
}

export function useFeatureFlag<T extends FeatureFlagValue = boolean>(
  name: FeatureFlagName,
  options?: FeatureFlagOptions<T>
): UseFeatureFlagResult<T> {
  const ctx = useContext(FeatureFlagsContext)
  const fallback = (options?.default ?? false) as T

  if (!ctx) {
    return {
      value: fallback,
      isLoading: false,
      error: new Error(
        'useFeatureFlag requer <FeatureFlagsProvider> em um ancestral. ' +
          'Adicione em app/(app)/layout.tsx via initialFlags = await resolveCriticalFlags(...).'
      ),
    }
  }

  const present = name in ctx.flags
  const value = present ? (ctx.flags[name] as T) : fallback
  return { value, isLoading: ctx.isHydrating, error: null }
}

export { unsafeFeatureFlagName } from './types'
