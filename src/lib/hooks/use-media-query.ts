'use client'
import { useCallback, useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  const getMatches = useCallback(() => {
    return window.matchMedia(query).matches
  }, [query])

  const subscribe = useCallback((onChange: () => void) => {
    const mediaQuery = window.matchMedia(query)
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [query])

  return useSyncExternalStore(subscribe, getMatches, () => false)
}
