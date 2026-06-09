'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, Download, Loader2, RefreshCcw, XCircle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Routes } from '@/lib/constants'

type CollectionErrorStatus = 'pending' | 'ignored' | 'retried'

interface CollectionError {
  errorId: string
  code: string
  message: string
  rootCause: string
  checkpoint: string | null
  timestamp: string | null
  retryable: boolean
  status: CollectionErrorStatus
}

interface ErrorsResponse {
  data?: { errors: CollectionError[]; total: number; page: number; limit: number }
  error?: { code: string; message: string }
}

const STATUS_BADGE: Record<CollectionErrorStatus, { label: string; variant: 'secondary' | 'outline' | 'destructive' } | null> = {
  pending: null,
  retried: { label: 'Retentado', variant: 'secondary' },
  ignored: { label: 'Ignorado', variant: 'outline' },
}

const IGNORE_UNDO_MS = 5000

/** Mapeia o status HTTP do backend para mensagem especifica (Zero Silencio). */
function backendErrorMessage(status: number, fallback: string): string {
  switch (status) {
    case 409:
      return 'Conflito: este erro ja esta sendo reprocessado.'
    case 422:
      return 'Erro nao retryavel: nao e possivel reprocessar este item.'
    case 500:
      return 'Falha interna do servidor ao processar a acao.'
    default:
      return fallback
  }
}

export default function ColetaErrosPage() {
  const { id } = useParams<{ id: string }>()
  const [errors, setErrors] = useState<CollectionError[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [confirmRetryAll, setConfirmRetryAll] = useState(false)
  // Timers de ignore pendente (commit diferido por IGNORE_UNDO_MS, com Desfazer).
  const ignoreTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/v1/collections/${id}/errors`)
      const json = (await res.json().catch(() => ({}))) as ErrorsResponse
      if (!res.ok) {
        setFetchError(json.error?.message ?? 'Erro ao carregar erros.')
        return
      }
      setErrors(json.data?.errors ?? [])
      setTotal(json.data?.total ?? 0)
    } catch {
      setFetchError('Erro de rede ao carregar os erros.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
    const timers = ignoreTimers.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [load])

  // Agrupamento por causa raiz (Zero Estados Indefinidos: ordem estavel).
  const grouped = useMemo(() => {
    const map = new Map<string, CollectionError[]>()
    for (const err of errors) {
      const key = err.rootCause || 'Outros'
      const list = map.get(key) ?? []
      list.push(err)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
  }, [errors])

  async function handleRetry(errorId: string) {
    setBusy(errorId)
    try {
      const res = await fetch(`/api/v1/collections/${id}/errors/${encodeURIComponent(errorId)}/retry`, { method: 'POST' })
      if (!res.ok) {
        toast.error(backendErrorMessage(res.status, 'Erro ao retentar.'))
        return
      }
      toast.success('Erro reenviado para reprocessamento.')
      setErrors((prev) => prev.map((e) => (e.errorId === errorId ? { ...e, status: 'retried' } : e)))
    } catch {
      toast.error('Erro de rede ao retentar.')
    } finally {
      setBusy(null)
    }
  }

  /** Commit diferido do ignore: otimista + janela de Desfazer de 5s. */
  function handleIgnore(errorId: string) {
    // Marca otimisticamente como ignorado.
    setErrors((prev) => prev.map((e) => (e.errorId === errorId ? { ...e, status: 'ignored' } : e)))

    const timer = setTimeout(() => {
      ignoreTimers.current.delete(errorId)
      void (async () => {
        try {
          const res = await fetch(`/api/v1/collections/${id}/errors/${encodeURIComponent(errorId)}/ignore`, { method: 'POST' })
          if (!res.ok) {
            toast.error(backendErrorMessage(res.status, 'Erro ao ignorar.'))
            setErrors((prev) => prev.map((e) => (e.errorId === errorId ? { ...e, status: 'pending' } : e)))
          }
        } catch {
          toast.error('Erro de rede ao ignorar.')
          setErrors((prev) => prev.map((e) => (e.errorId === errorId ? { ...e, status: 'pending' } : e)))
        }
      })()
    }, IGNORE_UNDO_MS)

    ignoreTimers.current.set(errorId, timer)

    toast.success('Erro ignorado.', {
      duration: IGNORE_UNDO_MS,
      action: {
        label: 'Desfazer',
        onClick: () => {
          const t = ignoreTimers.current.get(errorId)
          if (t) {
            clearTimeout(t)
            ignoreTimers.current.delete(errorId)
          }
          setErrors((prev) => prev.map((e) => (e.errorId === errorId ? { ...e, status: 'pending' } : e)))
        },
      },
    })
  }

  async function handleRetryAll() {
    setConfirmRetryAll(false)
    setBusy('retry-all')
    try {
      const res = await fetch(`/api/v1/collections/${id}/errors/retry-all`, { method: 'POST' })
      if (!res.ok) {
        toast.error(backendErrorMessage(res.status, 'Erro ao retentar todos.'))
        return
      }
      toast.success('Todos os erros foram reenviados para reprocessamento.')
      await load()
    } catch {
      toast.error('Erro de rede ao retentar todos.')
    } finally {
      setBusy(null)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`/api/v1/collections/${id}/errors/export`)
      if (!res.ok) {
        toast.error(backendErrorMessage(res.status, 'Falha ao exportar log.'))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `coleta-${id}-erros.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Log exportado com PII mascarada.')
    } catch {
      toast.error('Erro de rede ao exportar log.')
    } finally {
      setExporting(false)
    }
  }

  const retryableCount = errors.filter((e) => e.retryable && e.status === 'pending').length

  return (
    <div className="space-y-6 p-6">
      <Link
        href={Routes.COLLECTION_DETAIL(id)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para a coleta
      </Link>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Erros da coleta</h1>
          {!loading && <p className="text-sm text-muted-foreground">{total} erro(s) encontrado(s)</p>}
        </div>
        {errors.length > 0 && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleExport()}
              disabled={exporting}
              data-testid="export-errors-btn"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1" aria-hidden />
              )}
              Exportar log
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmRetryAll(true)}
              disabled={busy === 'retry-all' || retryableCount === 0}
              data-testid="retry-all-btn"
            >
              {busy === 'retry-all' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5 mr-1" aria-hidden />
              )}
              Retentar todos
            </Button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-12" aria-label="Carregando erros...">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {!loading && fetchError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {fetchError}
          <Button variant="ghost" size="sm" onClick={() => void load()} className="ml-auto">
            Tentar novamente
          </Button>
        </div>
      )}

      {!loading && !fetchError && errors.length === 0 && (
        <div role="status" className="text-center py-12 text-sm text-muted-foreground">
          Nenhum erro encontrado para esta coleta.
          <div className="mt-3">
            <Link href={Routes.COLLECTION_DETAIL(id)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Voltar para a coleta
            </Link>
          </div>
        </div>
      )}

      {!loading && !fetchError && errors.length > 0 && (
        <div className="space-y-6">
          {grouped.map(([rootCause, items]) => (
            <section key={rootCause} aria-label={`Causa raiz: ${rootCause}`} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">{rootCause}</h2>
                <Badge variant="secondary" className="text-xs">
                  {items.length}
                </Badge>
              </div>
              {items.map((err) => {
                const badge = STATUS_BADGE[err.status]
                return (
                  <Card key={err.errorId} data-testid={`error-item-${err.errorId}`} className={err.status === 'ignored' ? 'opacity-60' : ''}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <XCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
                          <CardTitle className="text-sm font-medium font-mono">{err.code}</CardTitle>
                          {badge && (
                            <Badge variant={badge.variant} className="text-xs">
                              {badge.label}
                            </Badge>
                          )}
                          {!err.retryable && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Nao retryavel
                            </Badge>
                          )}
                          {err.checkpoint && (
                            <span className="text-xs text-muted-foreground">checkpoint: {err.checkpoint}</span>
                          )}
                        </div>
                        {err.timestamp && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(err.timestamp).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground mb-3 break-words">{err.message}</p>
                      {err.status !== 'ignored' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!busy || err.status === 'retried' || !err.retryable}
                            onClick={() => void handleRetry(err.errorId)}
                            data-testid={`retry-btn-${err.errorId}`}
                          >
                            {busy === err.errorId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden />
                            ) : (
                              <RefreshCcw className="h-3.5 w-3.5 mr-1" aria-hidden />
                            )}
                            Retentar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!!busy}
                            onClick={() => handleIgnore(err.errorId)}
                            data-testid={`ignore-btn-${err.errorId}`}
                          >
                            Ignorar
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </section>
          ))}
        </div>
      )}

      <Dialog open={confirmRetryAll} onOpenChange={(o) => !o && setConfirmRetryAll(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reenviar todos os erros?</DialogTitle>
            <DialogDescription>
              {retryableCount} erro(s) retryavel(is) serao reenviados para reprocessamento. Esta acao registra um audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRetryAll(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleRetryAll()} data-testid="retry-all-confirm-btn">
              Reenviar todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
