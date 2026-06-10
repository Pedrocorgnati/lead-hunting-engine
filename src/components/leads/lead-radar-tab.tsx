'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, Clock3, Loader2, Minus, RefreshCw, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface Snapshot {
  id: string
  createdAt: string
  score: number
  changeCount: number
  fields: Record<string, { prev: unknown; next: unknown }>
}

interface SnapshotsResponse { data?: { snapshots: Snapshot[] }; error?: { code: string; message: string } }

export interface LeadRadarTabProps { leadId: string }

// Lead considerado desatualizado quando a captura mais recente tem mais de 7 dias.
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(vazio)'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function LeadRadarTab({ leadId }: LeadRadarTabProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const refreshSnapshots = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/snapshots`)
      const json = (await res.json().catch(() => ({}))) as SnapshotsResponse
      if (!res.ok) { setError(json.error?.message ?? 'Erro ao carregar snapshots.'); return }
      setSnapshots(json.data?.snapshots ?? [])
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [leadId])

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshSnapshots()
    }, 0)
    return () => clearTimeout(timer)
  }, [refreshSnapshots])

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  async function handleTrigger() {
    setTriggering(true)
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/radar/trigger`, { method: 'POST' })
      if (!res.ok) { toast.error('Erro ao acionar radar.'); return }
      toast.success('Radar acionado. Snapshot sera gerado em breve.')
      await refreshSnapshots()
    } catch { toast.error('Erro de rede.') } finally { setTriggering(false) }
  }

  async function handleRestore(snapshotId: string) {
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/snapshots/${snapshotId}/restore`, { method: 'POST' })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
        toast.error(json.error?.message ?? 'Erro ao reverter snapshot.')
        return
      }
      toast.success('Snapshot revertido: os campos rastreados do lead foram restaurados.')
      await refreshSnapshots()
    } catch { toast.error('Erro de rede.') } finally { setRestoreTarget(null) }
  }

  const latest = snapshots[0]
  const isStale = latest ? (now - new Date(latest.createdAt).getTime()) > STALE_THRESHOLD_MS : false

  return (
    <div className="space-y-4" data-testid={`lead-radar-tab-${leadId}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Historico de capturas radar do lead.</p>
        <Button size="sm" variant="outline" onClick={() => void handleTrigger()} disabled={triggering} data-testid="trigger-radar-btn">
          {triggering ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />}
          Atualizar radar
        </Button>
      </div>

      {!loading && !error && isStale && (
        <div role="status" data-testid="radar-stale-warning" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Dado desatualizado: a captura mais recente tem mais de 7 dias. Acione nova captura para atualizar o radar.
        </div>
      )}

      {loading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" /></div>}
      {!loading && error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2"><AlertCircle className="h-4 w-4" aria-hidden="true" />{error}</div>}
      {!loading && !error && snapshots.length === 0 && <div role="status" className="text-center py-8 text-sm text-muted-foreground">Nenhum snapshot de radar disponivel. Acione a captura acima.</div>}

      {!loading && !error && snapshots.length > 0 && (
        <div className="space-y-3">
          {snapshots.map((snap, idx) => {
            const older = snapshots[idx + 1]
            const scoreDelta = older ? snap.score - older.score : null
            const fieldEntries = Object.entries(snap.fields)
            return (
              <Card key={snap.id} data-testid={`snapshot-${snap.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <CardTitle className="text-sm font-medium">{new Date(snap.createdAt).toLocaleString('pt-BR')}</CardTitle>
                      {idx === 0 && <Badge variant="secondary" className="text-xs">Mais recente</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Score: {snap.score}</span>
                      {scoreDelta !== null && scoreDelta !== 0 && (
                        <span
                          data-testid={`snapshot-${snap.id}-score-delta`}
                          className={`inline-flex items-center text-xs font-medium ${scoreDelta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}
                          aria-label={`Impacto no score: ${scoreDelta > 0 ? 'subiu' : 'caiu'} ${Math.abs(scoreDelta)} pontos`}
                        >
                          {scoreDelta > 0 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />}
                          {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                        </span>
                      )}
                      {scoreDelta === 0 && (
                        <span className="inline-flex items-center text-xs text-muted-foreground" aria-label="Score sem alteracao">
                          <Minus className="h-3 w-3" aria-hidden="true" />0
                        </span>
                      )}
                      {snap.changeCount > 0 && <Badge variant="outline" className="text-xs">{snap.changeCount} mudanca(s)</Badge>}
                      <Button size="sm" variant="ghost" onClick={() => setRestoreTarget(snap.id)} data-testid={`restore-${snap.id}`}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden />
                        Reverter
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {fieldEntries.length > 0 && (
                  <CardContent className="pt-0">
                    <ul className="space-y-1" data-testid={`snapshot-${snap.id}-diff`}>
                      {fieldEntries.map(([key, { prev, next }]) => (
                        <li key={key} className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-muted-foreground min-w-[7rem]">{key}</span>
                          <span className="text-muted-foreground line-through">{formatFieldValue(prev)}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
                          <span className="text-foreground">{formatFieldValue(next)}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(open) => { if (!open) setRestoreTarget(null) }}
        title="Reverter snapshot"
        description="Esta acao substituira os dados atuais do lead pelos dados deste snapshot. O historico sera preservado."
        confirmLabel="Reverter"
        danger
        confirmationPhrase="REVERTER"
        confirmationLabel="Digite REVERTER para confirmar"
        onConfirm={() => restoreTarget ? void handleRestore(restoreTarget) : undefined}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  )
}
