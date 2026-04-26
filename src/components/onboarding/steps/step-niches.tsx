'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

interface NicheOption {
  id: string
  slug: string
  label: string
}

interface Props {
  options: NicheOption[]
  initial?: string[]
  onSubmit: (selected: string[]) => void | Promise<void>
  submitting?: boolean
}

export function StepNiches({ options, initial, onSubmit, submitting }: Props) {
  const [selected, setSelected] = useState<string[]>(initial ?? [])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return options
    const q = query.trim().toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.slug.includes(q))
  }, [options, query])

  function toggle(slug: string) {
    setError(null)
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  async function handleNext() {
    if (selected.length === 0) {
      setError('Selecione ao menos um nicho para continuar.')
      return
    }
    await onSubmit(selected)
  }

  return (
    <div data-testid="onboarding-step-niches" className="w-full space-y-4 text-left">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-foreground">Selecione seus nichos</h2>
        <p className="text-sm text-muted-foreground">
          Quais segmentos você quer prospectar? Escolha quantos quiser.
        </p>
      </div>

      <input
        type="text"
        data-testid="onboarding-niches-search"
        placeholder="Buscar nicho..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      />

      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="onboarding-niches-empty">
          Nenhum nicho cadastrado ainda. Peça ao administrador para configurar.
        </p>
      ) : (
        <div
          role="group"
          aria-label="Nichos disponíveis"
          className="grid max-h-64 grid-cols-1 gap-2 overflow-auto rounded-md border border-border p-2 sm:grid-cols-2"
        >
          {filtered.map((niche) => {
            const checked = selected.includes(niche.slug)
            return (
              <label
                key={niche.id}
                data-testid={`onboarding-niche-option-${niche.slug}`}
                className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={checked}
                  onChange={() => toggle(niche.slug)}
                />
                <span>{niche.label}</span>
              </label>
            )
          })}
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-sm text-muted-foreground">
              Nenhum nicho corresponde à busca.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive" data-testid="onboarding-niches-error">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {selected.length} selecionado{selected.length === 1 ? '' : 's'}
        </span>
        <Button
          data-testid="onboarding-niches-submit"
          onClick={handleNext}
          disabled={submitting}
        >
          {submitting ? 'Salvando...' : 'Continuar'}
        </Button>
      </div>
    </div>
  )
}
