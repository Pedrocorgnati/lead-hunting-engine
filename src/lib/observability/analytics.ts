/**
 * Analytics wrapper — GA4 + Plausible.
 *
 * TASK-1/ST006 (CL-309): wrapper que:
 *   - carrega scripts apenas apos consent (gancho via `consent:granted`)
 *   - respeita DNT
 *   - nao falha se envs nao estiverem configuradas (ambientes dev/CI)
 *
 * IDs esperados:
 *   - NEXT_PUBLIC_GA_ID         (ex: G-XXXXXXXXXX)
 *   - NEXT_PUBLIC_PLAUSIBLE_DOMAIN (ex: lead-hunting.engine)
 */

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    plausible?: (event: string, opts?: { props?: Record<string, unknown> }) => void
  }
}

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? ''
export const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? ''

export function isAnalyticsConfigured(): boolean {
  return Boolean(GA_ID || PLAUSIBLE_DOMAIN)
}

export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (typeof window === 'undefined') return

  try {
    if (GA_ID && typeof window.gtag === 'function') {
      window.gtag('event', name, params ?? {})
    }
    if (PLAUSIBLE_DOMAIN && typeof window.plausible === 'function') {
      window.plausible(name, params ? { props: params as Record<string, unknown> } : undefined)
    }
  } catch {
    // Nunca deve quebrar a UX
  }
}

export function trackPageView(path: string): void {
  trackEvent('page_view', { path })
}

// M14-G-011: eventos especificos do programa piloto.
// Disparados pelos services no ponto de mudanca de estado, NAO pelo cliente,
// para garantir que o evento ocorre mesmo se o usuario sair da pagina.
//
// Side note: como este modulo so funciona no client (gtag/plausible vivem em
// `window`), os helpers abaixo sao tambem chamaveis no server, mas viram no-op.
// Para tracking server-side completo, integrar com `api-usage-logger` futuro.

export function trackPilotInviteAccepted(userId: string, tag: string): void {
  trackEvent('pilot_invite_accepted', { userId, tag })
}

export function trackNpsSubmitted(
  userId: string,
  score: number,
  bucket: 'detractor' | 'passive' | 'promoter',
): void {
  trackEvent('nps_submitted', { userId, score, bucket })
}

export function trackPilotFirstCollection(userId: string, jobId: string): void {
  trackEvent('pilot_first_collection', { userId, jobId })
}

export function trackPilotFirstHotLead(userId: string, leadId: string): void {
  trackEvent('pilot_first_hot_lead', { userId, leadId })
}
