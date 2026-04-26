'use client'

import { useCallback, useEffect, useState } from 'react'

interface UnreadCountState {
  count: number
  loading: boolean
}

interface UseUnreadCountResult extends UnreadCountState {
  refresh: () => Promise<void>
}

const POLL_INTERVAL_MS = 30_000

/**
 * Hook que consome /api/v1/notifications/unread-count com polling de 30s.
 * Pausa o poll quando a aba nao esta visivel (Page Visibility API) para
 * evitar XHR desnecessarios; refaz quando volta ao foco.
 *
 * Origem: TASK-6 intake-review / CL-498.
 */
export function useUnreadCount(enabled = true): UseUnreadCountResult {
  const [state, setState] = useState<UnreadCountState>({ count: 0, loading: enabled })

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/notifications/unread-count', {
        credentials: 'include',
      })
      if (!res.ok) return
      const json = (await res.json()) as { data: { count: number } }
      setState({ count: json.data?.count ?? 0, loading: false })
    } catch {
      setState((prev) => ({ ...prev, loading: false }))
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let interval: ReturnType<typeof setInterval> | null = null
    let mounted = true

    async function tick() {
      if (!mounted) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      await fetchCount()
    }

    void fetchCount()
    interval = setInterval(tick, POLL_INTERVAL_MS)

    function onVisibility() {
      if (document.visibilityState === 'visible') void fetchCount()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mounted = false
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, fetchCount])

  return { ...state, refresh: fetchCount }
}
