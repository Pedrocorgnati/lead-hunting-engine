'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

const PROVIDERS: { id: string; label: string; description: string }[] = [
  {
    id: 'google_maps',
    label: 'Google Maps Places API',
    description: 'Coleta de leads a partir de buscas no Google Maps.',
  },
  {
    id: 'google_search',
    label: 'Google Custom Search',
    description: 'Pesquisa orgânica para descobrir sites e domínios.',
  },
  {
    id: 'instagram',
    label: 'Instagram Graph API',
    description: 'Enriquecimento de presença social.',
  },
  {
    id: 'facebook',
    label: 'Facebook Pages',
    description: 'Informações de páginas comerciais.',
  },
]

interface IntegrationEntry {
  provider: string
  configured: boolean
}

interface Props {
  initial?: { integrations: IntegrationEntry[]; skipped: boolean }
  onSubmit: (payload: { integrations: IntegrationEntry[]; skipped: boolean }) => void | Promise<void>
  submitting?: boolean
}

export function StepIntegrations({ initial, onSubmit, submitting }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const acc: Record<string, boolean> = {}
    for (const i of initial?.integrations ?? []) acc[i.provider] = i.configured
    return acc
  })

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleContinue(skipped: boolean) {
    const integrations: IntegrationEntry[] = PROVIDERS.map((p) => ({
      provider: p.id,
      configured: Boolean(checked[p.id]),
    }))
    await onSubmit({ integrations, skipped })
  }

  return (
    <div data-testid="onboarding-step-integrations" className="w-full space-y-4 text-left">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-foreground">Integrações básicas</h2>
        <p className="text-sm text-muted-foreground">
          Marque os provedores que você pretende configurar. As chaves de API podem ser
          adicionadas depois em <strong>Admin / Credenciais</strong>.
        </p>
      </div>

      <ul className="space-y-2">
        {PROVIDERS.map((p) => (
          <li
            key={p.id}
            data-testid={`onboarding-integration-${p.id}`}
            className="flex items-start gap-3 rounded-md border border-border p-3"
          >
            <input
              type="checkbox"
              id={`int-${p.id}`}
              className="mt-1 h-4 w-4"
              checked={Boolean(checked[p.id])}
              onChange={() => toggle(p.id)}
            />
            <label htmlFor={`int-${p.id}`} className="flex-1 cursor-pointer text-sm">
              <span className="block font-medium text-foreground">{p.label}</span>
              <span className="block text-xs text-muted-foreground">{p.description}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="onboarding-integrations-skip"
          onClick={() => handleContinue(true)}
          disabled={submitting}
        >
          Configurar depois
        </Button>
        <Button
          type="button"
          data-testid="onboarding-integrations-submit"
          onClick={() => handleContinue(false)}
          disabled={submitting}
        >
          {submitting ? 'Salvando...' : 'Continuar'}
        </Button>
      </div>
    </div>
  )
}
