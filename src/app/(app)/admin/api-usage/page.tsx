'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Download, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// Pagina canonica AD22 (/admin/api-usage). Um unico seletor de periodo governa
// todas as abas (uso por provider/operador, projecao e alertas de budget) e o
// export CSV. Consome os 4 endpoints declarados na task:
//   GET  /api/v1/admin/metrics/api-usage        (breakdown + operators)
//   GET  /api/v1/admin/api-usage/projection     (run-rate)
//   POST /api/v1/admin/api-usage/budget-alerts  (avaliacao on-demand)
//   GET  /api/v1/admin/api-usage/export         (CSV)

type Period = 'day' | 'week' | 'month'

interface BreakdownRow {
  provider: string
  callType: string
  count: number
  creditTotal: number
}
interface OperatorRow {
  userId: string | null
  email: string
  count: number
  creditTotal: number
}
interface UsageResponse {
  period: Period
  since: string
  breakdown: BreakdownRow[]
  operators: OperatorRow[]
}
interface ProjectionResponse {
  period: Period
  start: string
  end: string
  elapsedFraction: number
  current: { calls: number; credits: number }
  projected: { calls: number; credits: number }
  byProvider: Array<{ provider: string; currentCredits: number; projectedCredits: number }>
}
interface AlertResponse {
  period: Period
  budgetCredits: number
  usedCredits: number
  usageRatio: number
  projectedCredits: number
  projectedRatio: number
  warnThreshold: number
  status: 'ok' | 'approaching' | 'exceeded'
}
interface ApiEnvelope<T> {
  data?: T
  error?: { code: string; message: string }
}

// Periodo calendario (mesma convencao dos 4 endpoints): rotulos refletem o
// periodo-calendario atual, nao uma janela movel.
const PERIOD_LABELS: Record<Period, string> = { day: 'Hoje', week: 'Esta semana', month: 'Este mes' }

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { cache: 'no-store', ...init })
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
  if (!res.ok) throw new Error(json.error?.message ?? `Erro ${res.status}.`)
  if (json.data === undefined) throw new Error('Resposta sem dados.')
  return json.data
}

function StateBlock({
  loading,
  error,
  onRetry,
}: {
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Carregando</span>
      </div>
    )
  }
  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
      >
        <span className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </span>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    )
  }
  return null
}

export default function ApiUsagePage() {
  const [period, setPeriod] = useState<Period>('month')

  const [usage, setUsage] = useState<UsageResponse | null>(null)
  const [usageLoading, setUsageLoading] = useState(true)
  const [usageError, setUsageError] = useState<string | null>(null)

  const [projection, setProjection] = useState<ProjectionResponse | null>(null)
  const [projLoading, setProjLoading] = useState(true)
  const [projError, setProjError] = useState<string | null>(null)

  const [budget, setBudget] = useState('')
  const [alert, setAlert] = useState<AlertResponse | null>(null)
  const [alertLoading, setAlertLoading] = useState(false)
  const [alertError, setAlertError] = useState<string | null>(null)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const loadUsage = useCallback(async () => {
    setUsageLoading(true)
    setUsageError(null)
    try {
      setUsage(await fetchJson<UsageResponse>(`/api/v1/admin/metrics/api-usage?period=${period}`))
    } catch (e) {
      setUsageError((e as Error).message)
    } finally {
      setUsageLoading(false)
    }
  }, [period])

  const loadProjection = useCallback(async () => {
    setProjLoading(true)
    setProjError(null)
    try {
      setProjection(
        await fetchJson<ProjectionResponse>(`/api/v1/admin/api-usage/projection?period=${period}`),
      )
    } catch (e) {
      setProjError((e as Error).message)
    } finally {
      setProjLoading(false)
    }
  }, [period])

  useEffect(() => {
    void loadUsage()
    void loadProjection()
    setAlert(null)
  }, [loadUsage, loadProjection])

  const submitBudget = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const value = Number(budget)
      if (!Number.isFinite(value) || value <= 0) {
        setAlertError('Informe um budget em creditos maior que zero.')
        setAlert(null)
        return
      }
      setAlertLoading(true)
      setAlertError(null)
      try {
        setAlert(
          await fetchJson<AlertResponse>('/api/v1/admin/api-usage/budget-alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ budgetCredits: value, period }),
          }),
        )
      } catch (err) {
        setAlertError((err as Error).message)
        setAlert(null)
      } finally {
        setAlertLoading(false)
      }
    },
    [budget, period],
  )

  const handleExport = useCallback(async () => {
    setExporting(true)
    setExportError(null)
    try {
      const res = await fetch(`/api/v1/admin/api-usage/export?period=${period}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as ApiEnvelope<unknown>
        throw new Error(json.error?.message ?? `Erro ${res.status}.`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `api-usage-${period}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError((e as Error).message)
    } finally {
      setExporting(false)
    }
  }, [period])

  const totalCredits = usage?.breakdown.reduce((acc, r) => acc + r.creditTotal, 0) ?? 0
  const totalCalls = usage?.breakdown.reduce((acc, r) => acc + r.count, 0) ?? 0

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Uso de API</h1>
          <p className="text-sm text-muted-foreground">Custo e uso por provider e operador.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Selecionar periodo">
            {(['day', 'week', 'month'] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? 'default' : 'outline'}
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      {exportError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {exportError}
        </div>
      )}

      <Tabs defaultValue="uso" className="w-full">
        <TabsList>
          <TabsTrigger value="uso">Uso</TabsTrigger>
          <TabsTrigger value="projecao">Projecao</TabsTrigger>
          <TabsTrigger value="alertas">Alertas de budget</TabsTrigger>
        </TabsList>

        <TabsContent value="uso" className="space-y-4 pt-4">
          <StateBlock loading={usageLoading} error={usageError} onRetry={() => void loadUsage()} />
          {!usageLoading && !usageError && usage && (
            <>
              <p className="text-sm text-muted-foreground">
                {totalCalls} chamadas / {totalCredits} creditos desde{' '}
                {new Date(usage.since).toLocaleDateString('pt-BR')}
              </p>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Por provider e tipo</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {usage.breakdown.length === 0 ? (
                    <p role="status" className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum dado de uso disponivel neste periodo.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="py-2">Provider</th>
                          <th className="py-2">Tipo</th>
                          <th className="py-2 text-right">Chamadas</th>
                          <th className="py-2 text-right">Creditos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.breakdown.map((r) => (
                          <tr key={`${r.provider}-${r.callType}`} className="border-b last:border-0">
                            <td className="py-2 font-medium">{r.provider}</td>
                            <td className="py-2">{r.callType}</td>
                            <td className="py-2 text-right tabular-nums">{r.count}</td>
                            <td className="py-2 text-right tabular-nums">{r.creditTotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Por operador</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {usage.operators.length === 0 ? (
                    <p role="status" className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum operador com uso neste periodo.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="py-2">Operador</th>
                          <th className="py-2 text-right">Chamadas</th>
                          <th className="py-2 text-right">Creditos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.operators.map((o) => (
                          <tr key={o.userId ?? 'sistema'} className="border-b last:border-0">
                            <td className="py-2 font-medium">{o.email}</td>
                            <td className="py-2 text-right tabular-nums">{o.count}</td>
                            <td className="py-2 text-right tabular-nums">{o.creditTotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="projecao" className="space-y-4 pt-4">
          <StateBlock loading={projLoading} error={projError} onRetry={() => void loadProjection()} />
          {!projLoading && !projError && projection && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Projecao por run-rate ({Math.round(projection.elapsedFraction * 100)}% do periodo
                  decorrido)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Chamadas atuais</dt>
                    <dd className="font-medium tabular-nums">{projection.current.calls}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Chamadas projetadas</dt>
                    <dd className="font-medium tabular-nums">{projection.projected.calls}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Creditos atuais</dt>
                    <dd className="font-medium tabular-nums">{projection.current.credits}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Creditos projetados</dt>
                    <dd className="font-medium tabular-nums">{projection.projected.credits}</dd>
                  </div>
                </dl>
                {projection.byProvider.length === 0 ? (
                  <p role="status" className="py-4 text-center text-sm text-muted-foreground">
                    Sem dados para projetar neste periodo.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2">Provider</th>
                        <th className="py-2 text-right">Creditos atuais</th>
                        <th className="py-2 text-right">Creditos projetados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projection.byProvider.map((p) => (
                        <tr key={p.provider} className="border-b last:border-0">
                          <td className="py-2 font-medium">{p.provider}</td>
                          <td className="py-2 text-right tabular-nums">{p.currentCredits}</td>
                          <td className="py-2 text-right tabular-nums">{p.projectedCredits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="alertas" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avaliar budget</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <form onSubmit={submitBudget} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="budget">Budget de creditos ({PERIOD_LABELS[period]})</Label>
                  <Input
                    id="budget"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="ex: 1000"
                    className="w-40"
                  />
                </div>
                <Button type="submit" disabled={alertLoading}>
                  {alertLoading && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  Avaliar
                </Button>
              </form>

              {alertError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  {alertError}
                </div>
              )}

              {alert && (
                <div
                  role="status"
                  className={`rounded-lg border p-4 text-sm ${
                    alert.status === 'exceeded'
                      ? 'border-destructive/40 bg-destructive/5 text-destructive'
                      : alert.status === 'approaching'
                        ? 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400'
                        : 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  <p className="font-medium">
                    {alert.status === 'exceeded'
                      ? 'Budget estourado'
                      : alert.status === 'approaching'
                        ? 'Budget proximo do limite'
                        : 'Dentro do budget'}
                  </p>
                  <p className="mt-1 text-foreground/80">
                    Uso: {alert.usedCredits} / {alert.budgetCredits} creditos (
                    {Math.round(alert.usageRatio * 100)}%). Projecao ao fim do periodo:{' '}
                    {alert.projectedCredits} creditos ({Math.round(alert.projectedRatio * 100)}%).
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
