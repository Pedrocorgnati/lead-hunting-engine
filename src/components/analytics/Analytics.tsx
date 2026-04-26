'use client'

import Script from 'next/script'
import { useEffect, useSyncExternalStore } from 'react'
import { GA_ID, PLAUSIBLE_DOMAIN, trackPageView } from '@/lib/observability/analytics'
import { usePathname, useSearchParams } from 'next/navigation'

const CONSENT_STORAGE_KEY = 'landingConsent'

function readConsent(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { categories?: string[] }
    return Array.isArray(parsed.categories) && parsed.categories.includes('analytics')
  } catch {
    return false
  }
}

function subscribeConsent(callback: () => void): () => void {
  const handle = () => callback()
  window.addEventListener('consent:granted', handle)
  window.addEventListener('consent:revoked', handle)
  window.addEventListener('storage', handle)
  return () => {
    window.removeEventListener('consent:granted', handle)
    window.removeEventListener('consent:revoked', handle)
    window.removeEventListener('storage', handle)
  }
}

/**
 * TASK-1/ST006: Analytics wrapper com consent gate.
 * Scripts so carregam apos evento `consent:granted` OU se ja existe
 * consent armazenado em localStorage.
 *
 * Ligacao com TASK-3 (cookie banner):
 *   - Banner escreve `landingConsent` no localStorage
 *   - Banner dispara CustomEvent('consent:granted')
 *   - useSyncExternalStore mantem este componente sincronizado.
 */
export function Analytics() {
  const consentGranted = useSyncExternalStore(
    subscribeConsent,
    readConsent,
    () => false,
  )
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!consentGranted) return
    const qs = searchParams?.toString()
    const path = pathname + (qs ? `?${qs}` : '')
    trackPageView(path)
  }, [consentGranted, pathname, searchParams])

  if (!consentGranted) return null

  return (
    <>
      {GA_ID && (
        <>
          <Script
            id="ga4-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { anonymize_ip: true, send_page_view: false });
            `}
          </Script>
        </>
      )}
      {PLAUSIBLE_DOMAIN && (
        <Script
          id="plausible"
          src="https://plausible.io/js/script.js"
          data-domain={PLAUSIBLE_DOMAIN}
          strategy="afterInteractive"
        />
      )}
    </>
  )
}
