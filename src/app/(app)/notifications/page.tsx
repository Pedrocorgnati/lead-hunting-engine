'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner'

type FilterStatus = 'all' | 'unread' | 'read'

interface NotificationRow {
  id: string
  type: string
  title: string
  message: string
  data: unknown
  read: boolean
  readAt: string | null
  createdAt: string
}

interface ListResponse {
  data: NotificationRow[]
  meta: { page: number; limit: number; total: number; hasNext: boolean; hasPrev: boolean }
}

const PAGE_SIZE = 20

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function ctaFromData(data: unknown): { label: string; href: string } | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.leadId === 'string') return { label: 'Abrir lead', href: `/leads/${d.leadId}` }
  if (typeof d.jobId === 'string') return { label: 'Ver coleta', href: `/coletas/${d.jobId}` }
  return null
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationRow[]>([])
  const [status, setStatus] = useState<FilterStatus>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [marking, setMarking] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(
        `/api/v1/notifications?status=${status}&page=${page}&limit=${PAGE_SIZE}`,
        { credentials: 'include' }
      )
      if (!res.ok) throw new Error('Falha ao listar')
      const json: ListResponse = await res.json()
      setItems(json.data)
      setTotal(json.meta.total)
    } catch {
      setError(true)
      toast.error('Nao foi possivel carregar suas notificacoes.')
    } finally {
      setLoading(false)
    }
  }, [status, page])

  useEffect(() => { load() }, [load])

  async function markAsRead(id: string) {
    setMarking(id)
    try {
      const res = await fetch(`/api/v1/notifications/${id}/read`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error()
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n)))
    } catch {
      toast.error('Nao foi possivel marcar como lida.')
    } finally {
      setMarking(null)
    }
  }

  async function deleteOne(id: string) {
    if (deletingId) return
    setDeletingId(id)
    const snapshot = items
    setItems((prev) => prev.filter((n) => n.id !== id))
    setTotal((t) => Math.max(0, t - 1))
    try {
      const res = await fetch(`/api/v1/notifications/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error()
      toast.success('Notificacao removida.')
    } catch {
      setItems(snapshot)
      setTotal(snapshot.length)
      toast.error('Nao foi possivel remover a notificacao.')
    } finally {
      setDeletingId(null)
    }
  }

  async function markAllAsRead() {
    setMarkingAll(true)
    try {
      const res = await fetch('/api/v1/notifications/read-all', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error()
      toast.success('Todas as notificacoes foram marcadas como lidas.')
      await load()
    } catch {
      toast.error('Nao foi possivel marcar todas como lidas.')
    } finally {
      setMarkingAll(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div data-testid="notifications-page" className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Notificacoes</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/settings/notifications"
            data-testid="notifications-settings-link"
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            Preferencias
          </Link>
          <Button
            data-testid="notifications-mark-all"
            variant="outline"
            size="sm"
            onClick={markAllAsRead}
            disabled={markingAll || loading || items.every((n) => n.read)}
          >
            {markingAll ? 'Marcando...' : 'Marcar todas como lidas'}
          </Button>
        </div>
      </div>

      <NotificationPermissionBanner />

      <div
        role="tablist"
        aria-label="Filtro de notificacoes"
        className="inline-flex items-center gap-1 rounded-lg border bg-card p-1"
      >
        {(['all', 'unread', 'read'] as FilterStatus[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            data-testid={`notifications-filter-${s}`}
            onClick={() => { setStatus(s); setPage(1) }}
            className={
              status === s
                ? 'px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground'
                : 'px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground'
            }
          >
            {s === 'all' ? 'Todas' : s === 'unread' ? 'Nao lidas' : 'Lidas'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border bg-card p-6 text-center space-y-4">
          <p className="text-sm text-muted-foreground">Nao foi possivel carregar suas notificacoes.</p>
          <Button variant="outline" onClick={load}>Tentar novamente</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={status === 'unread' ? 'Tudo em dia' : 'Sem notificacoes'}
          description={
            status === 'unread'
              ? 'Voce nao tem notificacoes pendentes.'
              : 'Quando houver coletas, leads novos ou alertas, eles aparecerao aqui.'
          }
        />
      ) : (
        <ul className="space-y-3" data-testid="notifications-list">
          {items.map((n) => {
            const cta = ctaFromData(n.data)
            return (
              <li
                key={n.id}
                data-testid={`notification-item-${n.id}`}
                data-read={n.read ? 'true' : 'false'}
                className={
                  n.read
                    ? 'rounded-lg border bg-card p-4'
                    : 'rounded-lg border-2 border-primary/40 bg-primary/5 p-4'
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground truncate">{n.title}</h2>
                      {!n.read && (
                        <Badge variant="default" className="text-[10px] uppercase">Nova</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(n.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {cta && (
                      <Link
                        href={cta.href}
                        data-testid={`notification-cta-${n.id}`}
                        onClick={() => { if (!n.read) markAsRead(n.id) }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {cta.label}
                      </Link>
                    )}
                    {!n.read && (
                      <Button
                        data-testid={`notification-mark-${n.id}`}
                        variant="ghost"
                        size="sm"
                        disabled={marking === n.id}
                        onClick={() => markAsRead(n.id)}
                      >
                        {marking === n.id ? '...' : 'Marcar como lida'}
                      </Button>
                    )}
                    <Button
                      data-testid={`notification-delete-${n.id}`}
                      variant="ghost"
                      size="sm"
                      aria-label="Remover notificacao"
                      disabled={deletingId === n.id}
                      onClick={() => deleteOne(n.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden={true} />
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {totalPages > 1 && !loading && !error && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Pagina {page} de {totalPages} — {total} notifica{total === 1 ? 'cao' : 'coes'}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Proxima
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
