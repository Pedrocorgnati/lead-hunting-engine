'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/lib/hooks/use-toast'
import { getScoringRules, saveScoringRules, DEFAULT_SCORING_RULES } from '@/actions/config'
import type { ScoringRule } from '@/actions/config'
import { ScoringImpactPreview } from './ScoringImpactPreview'
import { ScoringRuleHistoryModal } from './ScoringRuleHistoryModal'

export function ScoringRulesForm() {
  const [rules, setRules] = useState<ScoringRule[]>(DEFAULT_SCORING_RULES)
  const [originalRules, setOriginalRules] = useState<ScoringRule[]>(DEFAULT_SCORING_RULES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [historyOpenFor, setHistoryOpenFor] = useState<ScoringRule | null>(null)
  const toast = useToast()

  useEffect(() => {
    getScoringRules()
      .then((r) => {
        setRules(r)
        setOriginalRules(r)
      })
      .finally(() => setLoading(false))
  }, [])

  const total = rules.reduce((sum, r) => sum + r.weight, 0)
  const isValid = total === 100

  const hasChanges = useMemo(() => {
    if (rules.length !== originalRules.length) return true
    return rules.some((r, i) => r.weight !== originalRules[i]?.weight)
  }, [rules, originalRules])

  const hasRangeError = rules.some((r) => r.weight < 0 || r.weight > 100)

  const changedRules = rules.filter((r, i) => r.weight !== originalRules[i]?.weight)

  const handleWeightChange = (dimension: string, value: number) => {
    setRules((prev) =>
      prev.map((r) => (r.dimension === dimension ? { ...r, weight: value } : r)),
    )
  }

  const handleCancel = () => {
    setRules(originalRules)
    setConfirmOpen(false)
  }

  const handleConfirmSave = async () => {
    if (!isValid || hasRangeError) return
    setSaving(true)
    try {
      await saveScoringRules(rules)
      setOriginalRules(rules)
      setConfirmOpen(false)
      toast.success('Regras de scoring salvas.')
    } catch {
      toast.error('Erro ao salvar regras. Tente novamente.')
    }
    setSaving(false)
  }

  return (
    <div
      data-testid="admin-config-scoring-section"
      aria-labelledby="scoring-heading"
      className="rounded-lg border bg-card p-6 space-y-4"
    >
      <div>
        <h2 id="scoring-heading" className="text-sm font-semibold text-foreground">
          Regras de Scoring
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Ajuste os pesos das dimensoes de oportunidade. A soma deve ser 100%.
        </p>
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
          {rules.map((rule) => {
            const original = originalRules.find((o) => o.dimension === rule.dimension)
            const currentWeight = original?.weight ?? rule.weight
            const outOfRange = rule.weight < 0 || rule.weight > 100
            return (
              <div key={rule.dimension} className="space-y-1">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <div className="md:w-48">
                    <p className="text-sm font-medium text-foreground">{rule.label}</p>
                    <p className="text-xs text-muted-foreground">{rule.description}</p>
                  </div>
                  <div className="flex-1 flex flex-wrap items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={rule.weight}
                      onChange={(e) => handleWeightChange(rule.dimension, Number(e.target.value))}
                      aria-label={`Peso para ${rule.label}: ${rule.weight}%`}
                      className="flex-1 min-w-[120px] accent-primary h-2"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={rule.weight}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (!Number.isFinite(v)) return
                        handleWeightChange(rule.dimension, v)
                      }}
                      aria-label={`Peso exato para ${rule.label}`}
                      data-testid={`scoring-weight-input-${rule.dimension}`}
                      className={cn(
                        'w-16 rounded-md border bg-background px-2 py-1 text-sm tabular-nums',
                        outOfRange && 'border-destructive',
                      )}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    {rule.id && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                        onClick={() => setHistoryOpenFor(rule)}
                        data-testid={`scoring-history-open-${rule.dimension}`}
                      >
                        Historico
                      </button>
                    )}
                  </div>
                </div>
                {outOfRange && (
                  <p className="text-xs text-destructive">O peso deve estar entre 0 e 100.</p>
                )}
                {rule.weight !== currentWeight && !outOfRange && (
                  <div className="md:ml-48">
                    <ScoringImpactPreview
                      ruleSlug={rule.dimension}
                      newWeight={rule.weight}
                      currentWeight={currentWeight}
                    />
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex items-center justify-between border-t border-border pt-4 gap-2 flex-wrap">
            <span
              className={cn(
                'text-sm font-medium',
                isValid ? 'text-muted-foreground' : 'text-destructive',
              )}
            >
              Total: {total}%{!isValid && ' (deve ser 100%)'}
            </span>
            <div className="flex gap-2">
              {hasChanges && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={handleCancel}
                  disabled={saving}
                  data-testid="admin-config-scoring-cancel-button"
                >
                  Cancelar
                </Button>
              )}
              <Button
                data-testid="admin-config-scoring-save-button"
                onClick={() => setConfirmOpen(true)}
                disabled={!isValid || hasRangeError || !hasChanges || saving}
              >
                {saving ? 'Salvando...' : 'Salvar regras'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {historyOpenFor?.id && (
        <ScoringRuleHistoryModal
          ruleId={historyOpenFor.id}
          open={true}
          onClose={() => setHistoryOpenFor(null)}
          onRevert={(weight) => {
            handleWeightChange(historyOpenFor.dimension, weight)
            toast.success(
              `Peso de "${historyOpenFor.label}" revertido para ${weight}%. Ajuste outros pesos e salve.`,
            )
          }}
        />
      )}

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="scoring-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !saving && setConfirmOpen(false)}
          data-testid="admin-config-scoring-confirm-modal"
        >
          <div
            className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="scoring-confirm-title" className="text-base font-semibold">
              Aplicar nova configuracao de pesos?
            </h3>
            <p className="text-sm text-muted-foreground">
              Esta mudanca afetara a classificacao de todos os leads ao proximo
              recalculo. {changedRules.length} regra(s) sera(ao) alterada(s).
            </p>
            <ul className="space-y-1 text-xs text-foreground/80 max-h-40 overflow-auto">
              {changedRules.map((r) => {
                const prev =
                  originalRules.find((o) => o.dimension === r.dimension)?.weight ?? 0
                return (
                  <li key={r.dimension} className="flex justify-between">
                    <span>{r.label}</span>
                    <span className="tabular-nums">
                      {prev}% <span className="text-muted-foreground">-&gt;</span> {r.weight}%
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmSave}
                disabled={saving}
                data-testid="admin-config-scoring-confirm-button"
              >
                {saving ? 'Aplicando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
