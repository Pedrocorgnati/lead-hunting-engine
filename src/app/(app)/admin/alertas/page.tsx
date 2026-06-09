'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface Alert { id: string; name: string; status: 'ACTIVE' | 'RESOLVED' | 'SILENCED'; severity: 'critical' | 'high' | 'medium' | 'low'; message: string; triggeredAt: string | null }
interface AlertsResponse { data?: Alert[] | { alerts: Alert[] }; error?: { code: string; message: string } }

const SEVERITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  critical: 'destructive', high: 'destructive', medium: 'outline', low: 'secondary'
}

export default function AlertasPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/v1/admin/config/alerts')
      const json = (await res.json().catch(() => ({}))) as AlertsResponse
      if (!res.ok) { setError(json.error?.message ?? 'Erro ao carregar alertas.'); return }
      const list = Array.isArray(json.data) ? json.data : (json.data as {alerts:Alert[]})?.alerts ?? []
      setAlerts(list)
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleAck(id: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/v1/admin/config/alerts/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'SILENCED' }) })
      if (!res.ok) { toast.error('Erro ao silenciar alerta.'); return }
      toast.success('Alerta silenciado.')
      setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: 'SILENCED' } : a))
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
      {!loading && !error && alerts.length === 0 && <div role="status" className="text-center py-12 text-sm text-muted-foreground">Nenhum alerta registrado.</div>}
      {!loading && !error && alerts.length > 0 && (
        <div className="space-y-3">
          {[...active, ...others].map((alert) => (
            <Card key={alert.id} data-testid={`alert-${alert.id}`} className={alert.status === 'ACTIVE' ? 'border-destructive/30' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    {alert.status === 'ACTIVE' ? <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    <CardTitle className="text-sm font-medium">{alert.name}</CardTitle>
                    <Badge variant={SEVERITY_VARIANT[alert.severity] ?? 'outline'}>{alert.severity}</Badge>
                    <Badge variant="outline">{alert.status}</Badge>
                  </div>
                  {alert.status === 'ACTIVE' && (
                    <Button size="sm" variant="outline" disabled={busy === alert.id} onClick={() => void handleAck(alert.id)} data-testid={`ack-${alert.id}`}>
                      {busy === alert.id && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden />}
                      Silenciar
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">{alert.message}</p>
                {alert.triggeredAt && <p className="text-xs text-muted-foreground mt-1">Disparado: {new Date(alert.triggeredAt).toLocaleString('pt-BR')}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
