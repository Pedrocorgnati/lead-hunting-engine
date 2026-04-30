'use client'

/**
 * FeatureFlagsProvider — bridge SSR -> CSR.
 *
 * Cobre: TASK-2/ST004.
 *
 * Recebe `initialFlags` ja resolvidos pelo Server Component (chamou
 * `resolveCriticalFlags(ctx, names)` em `app/(app)/layout.tsx`) e
 * disponibiliza via Context para hooks `useFeatureFlag`.
 *
 * Refresh manual via `refreshFlags()` chama `/api/v1/feature-flags/resolve`.
 */

import { createContext, useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { FeatureFlagValue } from '@/lib/feature-flags/types'

export interface FeatureFlagsContextValue {
  flags: Record<string, FeatureFlagValue>
  isHydrating: boolean
  refreshFlags: (names?: string[]) => Promise<void>
}

export const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null)

interface FeatureFlagsProviderProps {
  initialFlags: Record<string, FeatureFlagValue>
  children: ReactNode
}

export function FeatureFlagsProvider({ initialFlags, children }: FeatureFlagsProviderProps) {
  const [flags, setFlags] = useState<Record<string, FeatureFlagValue>>(initialFlags)
  const [isHydrating, setIsHydrating] = useState<boolean>(false)

  const refreshFlags = useCallback(
    async (names?: string[]) => {
      const targets = names ?? Object.keys(flags)
      if (targets.length === 0) return
      setIsHydrating(true)
      try {
        const res = await fetch('/api/v1/feature-flags/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ names: targets }),
          cache: 'no-store',
        })
        if (!res.ok) return
        const body = (await res.json()) as { data?: { flags: Record<string, FeatureFlagValue> } }
        const next = body.data?.flags
        if (next) setFlags((prev) => ({ ...prev, ...next }))
      } finally {
        setIsHydrating(false)
      }
    },
    [flags]
  )

  const value = useMemo<FeatureFlagsContextValue>(
    () => ({ flags, isHydrating, refreshFlags }),
    [flags, isHydrating, refreshFlags]
  )

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>
}
