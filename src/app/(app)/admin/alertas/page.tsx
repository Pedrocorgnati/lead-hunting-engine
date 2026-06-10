'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, BellOff, CheckCircle2, Loader2, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface Alert {
  id: string
  rule: string
  name: string
  status: 'ACTIVE' | 'SILENCED' | 'RESOLVED'
  severity: 'critical' | 'high' | 'medium' | 'low' | string
  message: string
  triggeredAt: string
  silencedUntil: string | null
  resolvedAt: string | null
}
interface AlertsResponse { data?: { alerts?: Alert[] }; error?: { code: string; message: string } }

const SEVERITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  critical: 'destructive', high: 'destructive', medium: 'outline', low: 'secondary',
}
const STATUS_LABEL: Record<Alert['status'], string> = {
  ACTIVE: 'Ativo', SILENCED: 'Silenciado', RESOLVED: 'Resolvido',
}

export default function AlertasPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/v1/admin/alerts')
      const json = (await res.json().catch(() => ({}))) as AlertsResponse
      if (!res.ok) { setError(json.error?.message ?? 'Erro ao carregar alertas.'); return }
      setAlerts(json.data?.alerts ?? [])
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleAction(alert: Alert, action: 'silence' | 'resolve' | 'reopen') {
    setBusy(alert.id)
    try {
      const res = await fetch(`/api/v1/admin/alerts/${alert.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = (await res.json().catch(() => ({}))) as { data?: Alert; error?: { message?: string } }
      if (!res.ok) { toast.error(json.error?.message ?? 'Erro ao atualizar alerta.'); return }
      toast.success(
        action === 'silence' ? 'Alerta silenciado por 24h.' :
        action === 'resolve' ? 'Alerta resolvido.' : 'Alerta reaberto.',
      )
      if (json.data) {
        setAlerts((prev) => prev.map((a) => (a.id === alert.id ? json.data! : a)))
      } else {
        await load()
      }
    } catch { toast.error('Erro de rede.') } finally { setBusy(null) }
  }

  const active = alerts.filter((a) => a.status === 'ACTIVE')
  const others = alerts.filter((a) => a.status !== 'ACTIVE')

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Alertas operacionais</h1>{!loading && <p className="text-sm text-muted-foreground">{active.length} ativo(s)</p>}</div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>Atualizar</Button>
      </div>
      {loading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" /></div>}
      {!loading && error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2"><AlertCircle className="h-4 w-4" aria-hidden="true" />{error}</div>}
      {!loading && !error && alerts.length === 0 && (
        <div role="status" className="text-center py-12 text-sm text-muted-foreground">
          Nenhum alerta disparado ate agora. Os checks rodam a cada 5 minutos (cron check-alerts).
        </div>
      )}
      {!loading && !error && alerts.length > 0 && (
        <div className="space-y-3">
          {[...active, ...others].map((alert) => (
            <Card key={alert.id} data-testid={`alert-${alert.id}`} className={alert.status === 'ACTIVE' ? 'border-destructive/30' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {alert.status === 'ACTIVE' ? <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    <CardTitle className="text-sm font-medium">{alert.name}</CardTitle>
                    <Badge variant={SEVERITY_VARIANT[alert.severity] ?? 'outline'}>{alert.severity}</Badge>
                    <Badge variant="outline">{STATUS_LABEL[alert.status]}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {alert.status === 'ACTIVE' && (
                      <>
                        <Button size="sm" variant="ghost" disabled={busy === alert.id} onClick={() => void handleAction(alert, 'silence')} data-testid={`silence-${alert.id}`}>
                          <BellOff className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                          Silenciar 24h
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy === alert.id} onClick={() => void handleAction(alert, 'resolve')} data-testid={`resolve-${alert.id}`}>
                          {busy === alert.id && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden="true" />}
                          Resolver
                        </Button>
                      </>
                    )}
                    {alert.status !== 'ACTIVE' && (
                      <Button size="sm" variant="ghost" disabled={busy === alert.id} onClick={() => void handleAction(alert, 'reopen')} data-testid={`reopen-${alert.id}`}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        Reabrir
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Disparado: {new Date(alert.triggeredAt).toLocaleString('pt-BR')}
                  {alert.status === 'SILENCED' && alert.silencedUntil && ` · silenciado ate ${new Date(alert.silencedUntil).toLocaleString('pt-BR')}`}
                  {alert.status === 'RESOLVED' && alert.resolvedAt && ` · resolvido em ${new Date(alert.resolvedAt).toLocaleString('pt-BR')}`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
