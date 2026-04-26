/**
 * TASK-3/ST002 intake-review (CL-312, CL-362): wrapper do consent LGPD
 * da landing. Guarda em localStorage + sincroniza com server via
 * POST /api/v1/consent.
 */

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing'

export interface ConsentRecord {
  version: string
  categories: ConsentCategory[]
  acceptedAt: string
  consentId?: string
}

const STORAGE_KEY = 'landingConsent'
export const CONSENT_POLICY_VERSION = '1.0'

export function readConsent(): ConsentRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ConsentRecord
  } catch {
    return null
  }
}

export function hasConsent(category: ConsentCategory): boolean {
  const record = readConsent()
  if (!record) return false
  return record.categories.includes(category)
}

export async function persistConsent(
  categories: ConsentCategory[],
): Promise<ConsentRecord> {
  const now = new Date().toISOString()
  const local: ConsentRecord = {
    version: CONSENT_POLICY_VERSION,
    categories: Array.from(new Set<ConsentCategory>(['necessary', ...categories])),
    acceptedAt: now,
  }

  // Grava local imediatamente (user experience)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(local))
  } catch {
    // Storage desabilitado: continua sem persistir
  }

  // Notifica listeners (Analytics.tsx usa useSyncExternalStore)
  window.dispatchEvent(new CustomEvent('consent:granted', { detail: local }))

  // Sync com server em background — nao bloqueia UI
  try {
    const res = await fetch('/api/v1/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: local.version,
        categories: local.categories,
      }),
    })
    if (res.ok) {
      const json = await res.json().catch(() => null)
      if (json?.data?.id) {
        const updated: ConsentRecord = { ...local, consentId: String(json.data.id) }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        return updated
      }
    }
  } catch {
    // Server offline: mantemos local
  }

  return local
}

export function revokeConsent(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent('consent:revoked'))
  } catch {
    // nada
  }
}
