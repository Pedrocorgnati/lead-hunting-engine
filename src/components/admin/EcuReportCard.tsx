'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Download, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * EcuReportCard (C14.4 / item 071): relatorio ECU agregado em /admin/metricas.
 * Consome GET /api/v1/admin/metrics/ecu (periodo 7/30 dias), com export CSV
 * (deep-link &format=csv) e estados loading/empty/error explicitos.
 */
interface EcuReport {
  periodDays: number
  totalEvents: number
  bySeverity: { error: number; warning: number; info: number }
  byKind: Record<string, number>
  byRoute: Record<string, number>
}

function topEntries(map: Record<string, number>, n = 5): Array<[string, number]> {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n)
}

export function EcuReportCard() {
  const [days, setDays] = useState<7 | 30>(7)
  const [report, setReport] = useState<EcuReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/v1/admin/metrics/ecu?days=${days}`)
      const json = (await res.json().catch(() => ({}))) as { data?: EcuReport; error?: { message?: string } }
      if (!res.ok) { setError(json.error?.message ?? 'Erro ao carregar relatorio ECU.'); return }
      setReport(json.data ?? null)
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [days])

  useEffect(() => { void load() }, [load])

  return (
    <Card data-testid="ecu-report-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Relatorio ECU (Zero Silencio)</CardTitle>
          <div className="flex items-center gap-2">
            {([7, 30] as const).map((d) => (
              <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)}>
                {d} dias
              </Button>
            ))}
            <a href={`/api/v1/admin/metrics/ecu?days=${days}&format=csv`} download>
              <Button size="sm" variant="outline" data-testid="ecu-export-csv">
                <Download className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                CSV
              </Button>
            </a>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" /></div>}
        {!loading && error && (
          <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />{error}
          </div>
        )}
        {!loading && !error && report && report.totalEvents === 0 && (
          <p role="status" className="text-sm text-muted-foreground py-4">
            Nenhum evento ECU registrado nos ultimos {report.periodDays} dias. Eventos sao gerados
            por pitch, coletas acompanhadas, notificacoes, crons e abandono de fluxo.
          </p>
        )}
        {!loading && !error && report && report.totalEvents > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="font-medium">{report.totalEvents} eventos</span>
              <Badge variant="destructive">{report.bySeverity.error} erro(s)</Badge>
              <Badge variant="outline">{report.bySeverity.warning} aviso(s)</Badge>
              <Badge variant="secondary">{report.bySeverity.info} info</Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Top fluxos</p>
                <ul className="space-y-1 text-sm">
                  {topEntries(report.byKind).map(([kind, count]) => (
                    <li key={kind} className="flex justify-between gap-2">
                      <code className="text-xs">{kind}</code>
                      <span className="tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Top rotas</p>
                <ul className="space-y-1 text-sm">
                  {topEntries(report.byRoute).map(([route, count]) => (
                    <li key={route} className="flex justify-between gap-2">
                      <code className="text-xs truncate max-w-[16rem]" title={route}>{route}</code>
                      <span className="tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
