'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

/**
 * AD31 /admin/retencao (item 073 / C16) — painel de LEITURA da retencao.
 *
 * Decisao de escopo registrada em docs/ADR-retencao-admin-scope.md: nao ha
 * familia /api/v1/admin/retention/* dedicada; status vem de
 * GET /api/v1/admin/privacy/retention-status e as ACOES vivem nos mecanismos
 * existentes (cron admin, SystemConfig, DSAR), linkados abaixo.
 */
interface RetentionStatus {
  lastRun: { executedAt: string; deleted: number; rawDeleted: number; durationMs: number | null } | null
  nextExpiring: { in7days: number; in30days: number }
}

export default function RetencaoPage() {
  const [status, setStatus] = useState<RetentionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/v1/admin/privacy/retention-status')
      const json = (await res.json().catch(() => ({}))) as { data?: RetentionStatus; error?: { message?: string } }
      if (!res.ok) { setError(json.error?.message ?? 'Erro ao carregar status de retencao.'); return }
      setStatus(json.data ?? null)
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Retencao de dados</h1>
          <p className="text-sm text-muted-foreground">
            Status real da purga automatica e leads proximos da expiracao.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>Atualizar</Button>
      </div>

      {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" /></div>}
      {!loading && error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />{error}
        </div>
      )}

      {!loading && !error && status && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card data-testid="retention-last-run">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ultima purga</CardTitle></CardHeader>
            <CardContent>
              {status.lastRun ? (
                <>
                  <p className="text-sm font-medium">{new Date(status.lastRun.executedAt).toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {status.lastRun.deleted} leads + {status.lastRun.rawDeleted} raws removidos
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma purga registrada ainda.</p>
              )}
            </CardContent>
          </Card>
          <Card data-testid="retention-7d">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expiram em 7 dias</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold tabular-nums">{status.nextExpiring.in7days}</p></CardContent>
          </Card>
          <Card data-testid="retention-30d">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expiram em 30 dias</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold tabular-nums">{status.nextExpiring.in30days}</p></CardContent>
          </Card>
        </div>
      )}

      <div className="rounded-lg border border-muted bg-muted/30 p-4 text-sm space-y-2">
        <p className="font-medium">Onde agir (escopo: docs/ADR-retencao-admin-scope.md):</p>
        <ul className="text-muted-foreground space-y-1 text-xs list-disc pl-4">
          <li>Executar/pausar purgas: <Link href="/admin/jobs/cron" className="underline">/admin/jobs/cron</Link> (retention-cleanup, retention-sweep, lgpd-cleanup)</li>
          <li>Prazos de retencao (chaves retention.*): <Link href="/admin/configuracoes" className="underline">/admin/configuracoes</Link></li>
          <li>Solicitacoes de exclusao/exportacao por titular: <Link href="/admin/dsar" className="underline">/admin/dsar</Link></li>
        </ul>
      </div>
    </div>
  )
}
