'use client'

import { useEffect, useState } from 'react'

// TASK-19 (CL-503): detecta offline via navigator.onLine e mostra banner fixo topo.
// SSR-safe: inicia `null` e so define o valor real no cliente para evitar hydration mismatch.
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState<boolean | null>(null)

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] border-b border-[--color-warning] bg-[--color-warning] text-[--color-warning-foreground] shadow-sm"
      data-testid="offline-banner"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm">
        <svg
          className="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <p className="font-medium">
          Você está offline — algumas ações podem falhar.
        </p>
      </div>
    </div>
  )
}
