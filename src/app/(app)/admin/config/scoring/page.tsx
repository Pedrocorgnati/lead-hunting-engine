'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/use-auth'
import { useToast } from '@/lib/hooks/use-toast'
import { Routes } from '@/lib/constants'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

interface ScoringRule {
  id: string
  slug: string
  name: string
  description: string | null
  weight: number
  isActive: boolean
  sortOrder: number
}

export default function AdminScoringRulesPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const [rules, setRules] = useState<ScoringRule[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace(Routes.DASHBOARD)
  }, [isAdmin, authLoading, router])

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/admin/config/scoring-rules', { credentials: 'include' })
      if (!res.ok) throw new Error('fetch')
      const { data } = await res.json()
      setRules(data)
    } catch {
      toast.error('Não foi possível carregar as regras de scoring.')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchRules() }, [fetchRules])

  const updateLocal = (id: string, patch: Partial<ScoringRule>) => {
    setRules(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  const save = async (rule: ScoringRule) => {
    setSavingId(rule.id)
    try {
      const res = await fetch(`/api/v1/admin/config/scoring-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ weight: rule.weight, isActive: rule.isActive }),
      })
      if (!res.ok) throw new Error('save')
      toast.success(`Regra "${rule.name}" atualizada.`)
    } catch {
      toast.error('Erro ao salvar regra.')
    }
    setSavingId(null)
  }

  if (authLoading || !isAdmin) return null

  return (
    <div data-testid="admin-scoring-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Regras de Scoring</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ajuste pesos e ative/desative dimensões usadas no cálculo do score
        </p>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhuma regra cadastrada. Rode o seed para inicializar.
        </p>
      ) : (
        <ul className="space-y-3">
          {rules.map(rule => (
            <li
              key={rule.id}
              data-testid={`scoring-rule-${rule.slug}`}
              className="rounded-lg border bg-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-foreground">{rule.name}</h2>
                    <Badge variant="outline">{rule.slug}</Badge>
                    {!rule.isActive && <Badge variant="secondary">Inativa</Badge>}
                  </div>
                  {rule.description && (
                    <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3 md:items-end">
                <div className="space-y-1">
                  <Label htmlFor={`weight-${rule.id}`}>Peso (0–5)</Label>
                  <Input
                    id={`weight-${rule.id}`}
                    type="number"
                    min={0}
                    max={5}
                    value={rule.weight}
                    onChange={e => updateLocal(rule.id, { weight: Number(e.target.value) })}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`active-${rule.id}`}>Ativa</Label>
                  <div className="flex items-center gap-2 h-10">
                    <input
                      id={`active-${rule.id}`}
                      type="checkbox"
                      checked={rule.isActive}
                      onChange={e => updateLocal(rule.id, { isActive: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <span className="text-sm text-muted-foreground">
                      {rule.isActive ? 'Considerada no cálculo' : 'Ignorada no cálculo'}
                    </span>
                  </div>
                </div>

                <div className="flex md:justify-end">
                  <Button
                    size="sm"
                    onClick={() => save(rule)}
                    disabled={savingId === rule.id}
                    data-testid={`scoring-save-${rule.slug}`}
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    {savingId === rule.id ? 'Salvando…' : 'Salvar'}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
