'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import {
  CONSENT_POLICY_VERSION,
  persistConsent,
  readConsent,
  type ConsentCategory,
} from '@/lib/consent/store'

/**
 * TASK-3/ST002 intake-review (CL-312, CL-362):
 * Banner LGPD da landing. Aparece em primeira visita; bloqueia analytics
 * ate aceite. Usa useSyncExternalStore para sincronizar visibilidade com
 * o localStorage em tempo real (outras abas, for example).
 */

function subscribeStorage(callback: () => void): () => void {
  const handle = () => callback()
  window.addEventListener('storage', handle)
  window.addEventListener('consent:granted', handle)
  window.addEventListener('consent:revoked', handle)
  return () => {
    window.removeEventListener('storage', handle)
    window.removeEventListener('consent:granted', handle)
    window.removeEventListener('consent:revoked', handle)
  }
}

function hasAcceptedSnapshot(): boolean {
  return readConsent() !== null
}

export function CookieBanner() {
  const accepted = useSyncExternalStore(subscribeStorage, hasAcceptedSnapshot, () => true)
  const [customOpen, setCustomOpen] = useState(false)
  const [analyticsOn, setAnalyticsOn] = useState(true)
  const [marketingOn, setMarketingOn] = useState(false)
  const [busy, setBusy] = useState(false)

  if (accepted) return null

  async function save(categories: ConsentCategory[]) {
    setBusy(true)
    try {
      await persistConsent(categories)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-banner-title"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-4 py-4 shadow-lg backdrop-blur sm:px-8"
      data-testid="cookie-banner"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 text-sm">
            <p id="cookie-banner-title" className="font-semibold text-foreground">
              Privacidade em primeiro lugar
            </p>
            <p className="mt-1 text-muted-foreground">
              Usamos cookies essenciais para fazer o site funcionar. Com seu aceite,
              ativamos analytics para melhorar a experiencia. Voce pode mudar essas
              opcoes a qualquer momento em{' '}
              <Link href="/privacidade" className="text-primary hover:underline">
                Politica de Privacidade
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => save(['necessary'])}
              disabled={busy}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              data-testid="cookie-banner-reject"
            >
              Apenas essenciais
            </button>
            <button
              type="button"
              onClick={() => setCustomOpen((v) => !v)}
              disabled={busy}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              data-testid="cookie-banner-customize"
              aria-expanded={customOpen}
            >
              Personalizar
            </button>
            <button
              type="button"
              onClick={() => save(['necessary', 'analytics', 'marketing'])}
              disabled={busy}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              data-testid="cookie-banner-accept-all"
            >
              Aceitar tudo
            </button>
          </div>
        </div>

        {customOpen && (
          <div className="mt-4 rounded-lg border border-border bg-background p-4 text-sm">
            <p className="mb-3 font-medium text-foreground">Categorias</p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <input
                  id="consent-necessary"
                  type="checkbox"
                  checked
                  disabled
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary"
                />
                <label
                  htmlFor="consent-necessary"
                  className="text-xs text-muted-foreground"
                >
                  <strong className="text-foreground">Essenciais</strong> — login, seguranca, sessao.
                  Obrigatorios.
                </label>
              </li>
              <li className="flex items-start gap-2">
                <input
                  id="consent-analytics"
                  type="checkbox"
                  checked={analyticsOn}
                  onChange={(e) => setAnalyticsOn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary"
                />
                <label
                  htmlFor="consent-analytics"
                  className="text-xs text-muted-foreground"
                >
                  <strong className="text-foreground">Analytics</strong> — metricas agregadas
                  (GA4/Plausible) para melhorar a plataforma.
                </label>
              </li>
              <li className="flex items-start gap-2">
                <input
                  id="consent-marketing"
                  type="checkbox"
                  checked={marketingOn}
                  onChange={(e) => setMarketingOn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary"
                />
                <label
                  htmlFor="consent-marketing"
                  className="text-xs text-muted-foreground"
                >
                  <strong className="text-foreground">Marketing</strong> — retargeting e
                  campanhas personalizadas.
                </label>
              </li>
            </ul>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const categories: ConsentCategory[] = ['necessary']
                  if (analyticsOn) categories.push('analytics')
                  if (marketingOn) categories.push('marketing')
                  void save(categories)
                }}
                disabled={busy}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                data-testid="cookie-banner-save"
              >
                Salvar preferencias
              </button>
            </div>
          </div>
        )}
        <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          Politica v{CONSENT_POLICY_VERSION}
        </p>
      </div>
    </div>
  )
}
