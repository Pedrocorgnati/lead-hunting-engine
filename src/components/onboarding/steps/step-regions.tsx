'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

interface RegionOption {
  id: string
  uf: string
  name: string
  capital: string
  cities: string[]
}

export interface RegionSelection {
  uf: string
  cities: string[]
}

interface Props {
  options: RegionOption[]
  initial?: RegionSelection[]
  onSubmit: (selected: RegionSelection[]) => void | Promise<void>
  submitting?: boolean
}

export function StepRegions({ options, initial, onSubmit, submitting }: Props) {
  const [selected, setSelected] = useState<Record<string, Set<string>>>(() => {
    const acc: Record<string, Set<string>> = {}
    for (const r of initial ?? []) acc[r.uf] = new Set(r.cities)
    return acc
  })
  const [openUf, setOpenUf] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const totalSelected = useMemo(
    () => Object.keys(selected).filter((uf) => selected[uf] !== undefined).length,
    [selected]
  )

  function toggleUf(uf: string) {
    setError(null)
    setSelected((prev) => {
      const next = { ...prev }
      if (next[uf] !== undefined) delete next[uf]
      else next[uf] = new Set<string>()
      return next
    })
  }

  function toggleCity(uf: string, city: string) {
    setSelected((prev) => {
      const next = { ...prev }
      const set = new Set(next[uf] ?? [])
      if (set.has(city)) set.delete(city)
      else set.add(city)
      next[uf] = set
      return next
    })
  }

  async function handleNext() {
    const payload: RegionSelection[] = Object.entries(selected).map(([uf, cities]) => ({
      uf,
      cities: Array.from(cities),
    }))
    if (payload.length === 0) {
      setError('Selecione ao menos uma UF.')
      return
    }
    await onSubmit(payload)
  }

  return (
    <div data-testid="onboarding-step-regions" className="w-full space-y-4 text-left">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-foreground">Regiões-alvo</h2>
        <p className="text-sm text-muted-foreground">
          Em quais estados e cidades você quer buscar leads?
        </p>
      </div>

      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="onboarding-regions-empty">
          Nenhuma região cadastrada. Peça ao administrador para configurar.
        </p>
      ) : (
        <div
          role="group"
          aria-label="Estados disponíveis"
          className="max-h-72 space-y-1.5 overflow-auto rounded-md border border-border p-2"
        >
          {options.map((region) => {
            const active = selected[region.uf] !== undefined
            const citiesSel = selected[region.uf]
            const isOpen = openUf === region.uf
            return (
              <div
                key={region.id}
                data-testid={`onboarding-region-row-${region.uf}`}
                className="rounded-md border border-border"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      data-testid={`onboarding-region-uf-${region.uf}`}
                      className="h-4 w-4"
                      checked={active}
                      onChange={() => toggleUf(region.uf)}
                    />
                    <span className="font-medium">
                      {region.uf} — {region.name}
                    </span>
                  </label>
                  {active && region.cities.length > 0 && (
                    <button
                      type="button"
                      data-testid={`onboarding-region-toggle-cities-${region.uf}`}
                      onClick={() => setOpenUf(isOpen ? null : region.uf)}
                      className="text-xs text-primary hover:underline"
                    >
                      {isOpen ? 'Fechar cidades' : `Cidades (${citiesSel?.size ?? 0})`}
                    </button>
                  )}
                </div>
                {active && isOpen && region.cities.length > 0 && (
                  <div className="grid grid-cols-2 gap-1 border-t border-border p-2">
                    {region.cities.map((city) => (
                      <label
                        key={city}
                        className="flex items-center gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5"
                          checked={citiesSel?.has(city) ?? false}
                          onChange={() => toggleCity(region.uf, city)}
                        />
                        <span>{city}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive" data-testid="onboarding-regions-error">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {totalSelected} UF{totalSelected === 1 ? '' : 's'} selecionada{totalSelected === 1 ? '' : 's'}
        </span>
        <Button
          data-testid="onboarding-regions-submit"
          onClick={handleNext}
          disabled={submitting}
        >
          {submitting ? 'Salvando...' : 'Continuar'}
        </Button>
      </div>
    </div>
  )
}
