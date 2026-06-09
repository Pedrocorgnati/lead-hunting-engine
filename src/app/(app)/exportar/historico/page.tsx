'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Download, Loader2, RefreshCcw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface ExportItem {
  id: string
  filename: string
  status: 'READY' | 'EXPIRED' | 'PROCESSING' | 'FAILED'
  createdAt: string
  expiresAt: string | null
  rowCount: number | null
}

interface HistoryResponse { data?: { history: ExportItem[]; total: number }; error?: { code: string; message: string } }

export default function HistoricoExportacaoPage() {
  const [items, setItems] = useState<ExportItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/v1/export/history')
      const json = (await res.json().catch(() => ({}))) as HistoryResponse
      if (!res.ok) { setError(json.error?.message ?? 'Erro ao carregar historico.'); return }
      setItems(json.data?.history ?? []); setTotal(json.data?.total ?? 0)
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleDelete(id: string) {
    setBusy(`del-${id}`)
    try {
      const res = await fetch(`/api/v1/export/history/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir.'); return }
      toast.success('Exportacao removida.')
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch { toast.error('Erro de rede.') } finally { setBusy(null) }
  }

  async function handleRegenerate(id: string) {
    setBusy(`reg-${id}`)
    try {
      const res = await fetch(`/api/v1/export/history/${id}/regenerate`, { method: 'POST' })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
        toast.error(json.error?.message ?? 'Erro ao regenerar exportacao.')
        return
      }
      toast.success('Exportacao regenerada.')
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: 'PROCESSING' as const } : i))
    } catch { toast.error('Erro de rede.') } finally { setBusy(null) }
  }

  const VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    READY: 'secondary', EXPIRED: 'outline', PROCESSING: 'default', FAILED: 'destructive'
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Historico de exportacoes</h1>
          {!loading && <p className="text-sm text-muted-foreground">{total} exportacao(es)</p>}
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>Atualizar</Button>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" /></div>}
      {!loading && error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />{error}
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div role="status" className="text-center py-12 text-sm text-muted-foreground">Nenhuma exportacao encontrada.</div>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} data-testid={`export-${item.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-sm font-medium">{item.filename}</CardTitle>
                    <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('pt-BR')}{item.rowCount != null && ` · ${item.rowCount} linhas`}</p>
                  </div>
                  <Badge variant={VARIANT[item.status] ?? 'outline'}>{item.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex gap-2">
                {item.status === 'READY' && (
                  <a href={`/api/v1/export/history/${item.id}/download`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline" data-testid={`download-${item.id}`}>
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />Baixar
                  </a>
                )}
                {item.status !== 'PROCESSING' && (
                  <button
                    type="button"
                    onClick={() => void handleRegenerate(item.id)}
                    disabled={busy === `reg-${item.id}`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    data-testid={`regenerate-${item.id}`}
                    aria-label={`Regenerar exportacao ${item.filename}`}
                  >
                    {busy === `reg-${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="h-3.5 w-3.5" aria-hidden />}
                    Regenerar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(item.id)}
                  disabled={busy === `del-${item.id}`}
                  className="inline-flex items-center gap-1 text-xs text-destructive/70 hover:text-destructive"
                  data-testid={`delete-${item.id}`}
                  aria-label={`Remover exportacao ${item.filename}`}
                >
                  {busy === `del-${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                  Remover
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
