'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface AuditLogEntry {
  id: string
  action: string
  resource: string
  resourceId: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
  userId: string | null
  user: { id: string; name: string | null; email: string } | null
}

interface Filters {
  resource: string
  action: string
  userId: string
  correlationId: string
  from: string
  to: string
}

const EMPTY_FILTERS: Filters = {
  resource: '',
  action: '',
  userId: '',
  correlationId: '',
  from: '',
  to: '',
}

const PAGE_SIZE = 50

export function AuditLogTable() {
  const [rows, setRows] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<AuditLogEntry | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    if (filters.resource) params.set('resource', filters.resource)
    if (filters.action) params.set('action', filters.action)
    if (filters.userId) params.set('userId', filters.userId)
    if (filters.correlationId) params.set('correlationId', filters.correlationId)
    if (filters.from) params.set('from', new Date(filters.from).toISOString())
    if (filters.to) params.set('to', new Date(filters.to).toISOString())
    return params.toString()
  }, [page, filters])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/audit-log?${queryString}`)
      if (!res.ok) throw new Error('Falha ao listar audit log')
      const json = await res.json()
      setRows(json.data ?? [])
      setTotal(json.meta?.total ?? 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  function exportCsv() {
    const params = new URLSearchParams(queryString)
    params.delete('page')
    params.delete('limit')
    const url = `/api/v1/admin/audit-log/export?${params.toString()}`
    window.location.assign(url)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input
          placeholder="Recurso (ex: invites)"
          value={filters.resource}
          onChange={(e) => updateFilter('resource', e.target.value)}
          aria-label="Filtrar por recurso"
        />
        <Input
          placeholder="Acao (substring, case-insensitive)"
          value={filters.action}
          onChange={(e) => updateFilter('action', e.target.value)}
          aria-label="Filtrar por acao"
        />
        <Input
          placeholder="User ID (uuid)"
          value={filters.userId}
          onChange={(e) => updateFilter('userId', e.target.value)}
          aria-label="Filtrar por userId"
        />
        <Input
          placeholder="Correlation ID"
          value={filters.correlationId}
          onChange={(e) => updateFilter('correlationId', e.target.value)}
          aria-label="Filtrar por correlation id"
        />
        <Input
          type="datetime-local"
          value={filters.from}
          onChange={(e) => updateFilter('from', e.target.value)}
          aria-label="De"
        />
        <Input
          type="datetime-local"
          value={filters.to}
          onChange={(e) => updateFilter('to', e.target.value)}
          aria-label="Ate"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {loading ? 'Carregando...' : `${total} eventos`}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetFilters} disabled={loading}>
            Limpar
          </Button>
          <Button onClick={exportCsv} disabled={loading || total === 0}>
            Exportar CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Acao</TableHead>
              <TableHead>Recurso</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Correlation</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const metadata = (row.metadata ?? null) as Record<string, unknown> | null
              const correlationId =
                metadata && typeof metadata === 'object' && 'correlationId' in metadata
                  ? String((metadata as Record<string, unknown>).correlationId ?? '')
                  : ''
              return (
                <TableRow
                  key={row.id}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer"
                >
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <Badge variant="secondary">{row.action}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.resource}
                    {row.resourceId ? (
                      <span className="ml-1 font-mono text-muted-foreground">
                        {row.resourceId.slice(0, 8)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.user?.email ?? (row.userId ? row.userId.slice(0, 8) : 'sistema')}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {correlationId ? correlationId.slice(0, 12) : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.ipAddress ?? '—'}
                  </TableCell>
                </TableRow>
              )
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhum evento encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Pagina {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={loading || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Proxima
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              {selected?.action}
            </DialogTitle>
            <DialogDescription>
              {selected
                ? `${selected.resource} · ${new Date(selected.createdAt).toLocaleString('pt-BR')}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-xs">
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-mono">{selected.id}</dd>
                <dt className="text-muted-foreground">Resource ID</dt>
                <dd className="font-mono">{selected.resourceId ?? '—'}</dd>
                <dt className="text-muted-foreground">Usuario</dt>
                <dd>
                  {selected.user
                    ? `${selected.user.email}${selected.user.name ? ` (${selected.user.name})` : ''}`
                    : selected.userId ?? 'sistema'}
                </dd>
                <dt className="text-muted-foreground">IP</dt>
                <dd className="font-mono">{selected.ipAddress ?? '—'}</dd>
              </dl>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Metadata</div>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(selected.metadata ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!selected) return
                void navigator.clipboard.writeText(
                  JSON.stringify(selected.metadata ?? {}, null, 2)
                )
                toast.success('Copiado para area de transferencia')
              }}
              disabled={!selected}
            >
              Copiar metadata
            </Button>
            <Button onClick={() => setSelected(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
