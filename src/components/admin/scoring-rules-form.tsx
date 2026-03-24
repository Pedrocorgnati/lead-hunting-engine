'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/lib/hooks/use-toast'
import { getScoringRules, saveScoringRules, DEFAULT_SCORING_RULES } from '@/actions/config'
import type { ScoringRule } from '@/actions/config'

export function ScoringRulesForm() {
  const [rules, setRules] = useState<ScoringRule[]>(DEFAULT_SCORING_RULES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => {
    getScoringRules().then(setRules).finally(() => setLoading(false))
  }, [])

  const total = rules.reduce((sum, r) => sum + r.weight, 0)
  const isValid = total === 100

  const handleWeightChange = (dimension: string, value: number) => {
    setRules(prev => prev.map(r => r.dimension === dimension ? { ...r, weight: value } : r))
  }

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    try {
      await saveScoringRules(rules)
      toast.success('Regras de scoring salvas.')
    } catch {
      toast.error('Erro ao salvar regras. Tente novamente.')
    }
    setSaving(false)
  }

  return (
    <div data-testid="admin-config-scoring-section" aria-labelledby="scoring-heading" className="rounded-lg border bg-card p-6 space-y-4">
      <div>
        <h2 id="scoring-heading" className="text-sm font-semibold text-foreground">Regras de Scoring</h2>
        <p className="text-xs text-muted-foreground mt-1">Ajuste os pesos das dimensões de oportunidade</p>
      </div>

      {loading ? (
        <div className="space-y-4" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map(rule => (
            <div key={rule.dimension} className="space-y-1">
              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <div className="md:w-48">
                  <p className="text-sm font-medium text-foreground">{rule.label}</p>
                  <p className="text-xs text-muted-foreground">{rule.description}</p>
                </div>
                <div className="flex-1 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={rule.weight}
                    onChange={e => handleWeightChange(rule.dimension, Number(e.target.value))}
                    aria-label={`Peso para ${rule.label}: ${rule.weight}%`}
                    className="flex-1 accent-primary h-2"
                  />
                  <span className="text-sm font-mono text-foreground w-10 text-right tabular-nums">{rule.weight}%</span>
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className={cn('text-sm font-medium', isValid ? 'text-muted-foreground' : 'text-destructive')}>
              Total: {total}%{!isValid && ' (deve ser 100%)'}
            </span>
            <Button
              data-testid="admin-config-scoring-save-button"
              onClick={handleSave}
              disabled={!isValid || saving}
              aria-busy={saving}
            >
              {saving && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />}
              {saving ? 'Salvando...' : 'Salvar regras'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
