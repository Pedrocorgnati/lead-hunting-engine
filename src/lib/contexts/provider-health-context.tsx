'use client'

/**
 * ProviderHealthContext — fetch compartilhado de /api/v1/health/providers.
 *
 * Endpoint AUTENTICADO (nao admin-only): operadores tambem veem o badge.
 * Uma unica instancia por arvore de componentes, polling a cada 30s.
 * Alimenta todos os <ProviderHealthBadge /> sem requests duplicados.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react'

export interface ProviderHealthItem {
  source: string
  label: string
  status: 'UP' | 'DEGRADED' | 'DOWN' | 'PAUSED' | 'UNCONFIGURED'
  latencyMs: number | null
  quotaRemaining: number | null
  rateLimitResetAt: string | null
  lastError: string | null
  fallbackProvider: string | null
  updatedAt: string
}

interface ProviderHealthState {
  bySource: Map<string, ProviderHealthItem>
  loading: boolean
  error: boolean
}

interface ProviderHealthContextValue extends ProviderHealthState {
  getProvider: (source: string) => ProviderHealthItem | null
}

const POLL_INTERVAL_MS = 30_000
const RETRY_INTERVAL_MS = 10_000

const ProviderHealthContext = createContext<ProviderHealthContextValue | null>(null)

export function ProviderHealthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProviderHealthState>({
    bySource: new Map(),
    loading: true,
    error: false,
  })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchAll() {
    try {
      const res = await fetch('/api/v1/health/providers')
      if (!res.ok) {
        setState((s) => ({ ...s, loading: false, error: true }))
        timerRef.current = setTimeout(() => void fetchAll(), RETRY_INTERVAL_MS)
        return
      }
      const json = (await res.json().catch(() => ({}))) as { data?: ProviderHealthItem[] }
      const items = json.data ?? []
      const map = new Map<string, ProviderHealthItem>()
      for (const item of items) map.set(item.source, item)
      setState({ bySource: map, loading: false, error: false })
    } catch {
      setState((s) => ({ ...s, loading: false, error: true }))
      timerRef.current = setTimeout(() => void fetchAll(), RETRY_INTERVAL_MS)
      return
    }
    timerRef.current = setTimeout(() => void fetchAll(), POLL_INTERVAL_MS)
  }

  useEffect(() => {
    void fetchAll()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const value: ProviderHealthContextValue = {
    ...state,
    getProvider: (source) => state.bySource.get(source) ?? null,
  }

  return (
    <ProviderHealthContext.Provider value={value}>
      {children}
    </ProviderHealthContext.Provider>
  )
}

export function useProviderHealthContext(): ProviderHealthContextValue {
  const ctx = useContext(ProviderHealthContext)
  if (!ctx) {
    // Fallback seguro quando usado fora do provider (ex: Storybook, testes isolados)
    return {
      bySource: new Map(),
      loading: false,
      error: false,
      getProvider: () => null,
    }
  }
  return ctx
}
