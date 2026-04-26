'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'

/**
 * AlertsSettings — admin-only form para ajustar thresholds sem redeploy.
 *
 * Origem: TASK-13 intake-review / ST004 (CL-124).
 */
interface Thresholds {
  llmMonthlyUsd: number
  apiDailyCalls: number
  jobStuckMinutes: number
}

export function AlertsSettings() {
  const [thresholds, setThresholds] = useState<Thresholds | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/v1/admin/config/alerts')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { data: Thresholds }
        if (!cancelled) setThresholds(json.data)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!thresholds) return
    setSaving(true)
    try {
      const res = await fetch('/api/v1/admin/config/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholds),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success('Thresholds atualizados.')
    } catch (err) {
      toast.error(`Falha ao salvar: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" aria-busy="true">
            Carregando...
          </p>
        </CardContent>
      </Card>
    )
  }

  if (error || !thresholds) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive" role="alert">
            Nao foi possivel carregar thresholds: {error ?? 'sem dados'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alertas — thresholds</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4 max-w-md">
          <div>
            <Label htmlFor="llmMonthlyUsd">Custo LLM mensal (USD)</Label>
            <Input
              id="llmMonthlyUsd"
              type="number"
              min={1}
              step={1}
              value={thresholds.llmMonthlyUsd}
              onChange={(e) =>
                setThresholds({ ...thresholds, llmMonthlyUsd: Number(e.target.value) })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="apiDailyCalls">Chamadas API por dia</Label>
            <Input
              id="apiDailyCalls"
              type="number"
              min={1}
              step={100}
              value={thresholds.apiDailyCalls}
              onChange={(e) =>
                setThresholds({ ...thresholds, apiDailyCalls: Number(e.target.value) })
              }
              required
            />
          </div>
          <div>
            <Label htmlFor="jobStuckMinutes">Tempo em PENDING (min)</Label>
            <Input
              id="jobStuckMinutes"
              type="number"
              min={1}
              step={1}
              value={thresholds.jobStuckMinutes}
              onChange={(e) =>
                setThresholds({ ...thresholds, jobStuckMinutes: Number(e.target.value) })
              }
              required
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
