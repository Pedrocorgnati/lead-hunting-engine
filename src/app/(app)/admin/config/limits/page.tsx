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

interface Limits {
  leadsPerMonthMax: number
  maxConcurrentJobs: number
}

const DEFAULT_LIMITS: Limits = { leadsPerMonthMax: 500, maxConcurrentJobs: 3 }

export default function AdminLimitsPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace(Routes.DASHBOARD)
  }, [isAdmin, authLoading, router])

  const fetchLimits = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/admin/config/limits', { credentials: 'include' })
      if (!res.ok) throw new Error('fetch')
      const { data } = await res.json()
      setLimits({
        leadsPerMonthMax: data.leadsPerMonthMax ?? DEFAULT_LIMITS.leadsPerMonthMax,
        maxConcurrentJobs: data.maxConcurrentJobs ?? DEFAULT_LIMITS.maxConcurrentJobs,
      })
    } catch {
      toast.error('Não foi possível carregar os limites.')
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchLimits() }, [fetchLimits])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/v1/admin/config/limits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(limits),
      })
      if (!res.ok) throw new Error('save')
      toast.success('Limites atualizados.')
    } catch {
      toast.error('Erro ao salvar limites.')
    }
    setSaving(false)
  }

  if (authLoading || !isAdmin) return null

  return (
    <div data-testid="admin-limits-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Limites por conta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quotas de uso mensal e concorrência de coletas
        </p>
      </div>

      <form onSubmit={handleSave} className="rounded-lg border bg-card p-6 space-y-6 max-w-lg">
        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="leadsPerMonthMax">Leads por mês (máximo)</Label>
              <Input
                id="leadsPerMonthMax"
                type="number"
                min={1}
                max={100000}
                value={limits.leadsPerMonthMax}
                onChange={e => setLimits({ ...limits, leadsPerMonthMax: Number(e.target.value) })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Quantidade máxima de leads que podem ser coletados em um ciclo mensal.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxConcurrentJobs">Coletas simultâneas (máximo)</Label>
              <Input
                id="maxConcurrentJobs"
                type="number"
                min={1}
                max={50}
                value={limits.maxConcurrentJobs}
                onChange={e => setLimits({ ...limits, maxConcurrentJobs: Number(e.target.value) })}
                required
              />
              <p className="text-xs text-muted-foreground">
                Quantidade máxima de jobs em execução ao mesmo tempo.
              </p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
