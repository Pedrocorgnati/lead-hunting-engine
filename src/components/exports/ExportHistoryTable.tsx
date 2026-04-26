'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * ExportHistoryTable — lista paginada dos exports do usuario com re-download
 * e estado visual (loading / empty / error / success).
 *
 * Origem: TASK-22 intake-review / ST005 (CL-296, CL-492, CL-493).
 */
interface ExportRow {
  id: string
  format: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED'
  rowCount: number | null
  fileSize: number | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
  expiresAt: string | null
  createdAt: string
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeRemaining(iso: string | null): string {
  if (!iso) return '—'
  const ms = new Date(iso).getTime() - Date.now()
  if (ms < 0) return 'expirou'
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return `em ${hours}h`
  const mins = Math.floor(ms / 60_000)
  return `em ${mins}min`
}

const STATUS_VARIANT: Record<ExportRow['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  PROCESSING: 'secondary',
  COMPLETED: 'default',
  FAILED: 'destructive',
  EXPIRED: 'outline',
}

const STATUS_LABEL: Record<ExportRow['status'], string> = {
  PENDING: 'Na fila',
  PROCESSING: 'Processando',
  COMPLETED: 'Pronto',
  FAILED: 'Falhou',
  EXPIRED: 'Expirado',
}

export function ExportHistoryTable() {
  const [rows, setRows] = useState<ExportRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/v1/export/history?limit=20')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { data: ExportRow[] }
      setRows(json.data)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Refresh a cada 10s quando existem exports em andamento
    const interval = setInterval(() => {
      if (rows?.some((r) => r.status === 'PENDING' || r.status === 'PROCESSING')) {
        load()
      }
    }, 10_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows?.length])

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm">
        Nao foi possivel carregar o historico: {error}
        <Button variant="outline" size="sm" className="ml-3" onClick={load}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Voce ainda nao gerou nenhuma exportacao.{' '}
        <Link href="/exportar" className="underline">
          Criar exportacao
        </Link>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Formato</TableHead>
          <TableHead>Linhas</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Expira</TableHead>
          <TableHead className="text-right">Acoes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} data-testid={`export-row-${row.id}`}>
            <TableCell className="whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
            <TableCell>{row.format}</TableCell>
            <TableCell className="tabular-nums">{row.rowCount ?? '—'}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
              {row.status === 'FAILED' && row.error && (
                <p className="text-xs text-destructive mt-1 max-w-xs truncate" title={row.error}>
                  {row.error}
                </p>
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap">{timeRemaining(row.expiresAt)}</TableCell>
            <TableCell className="text-right">
              {row.status === 'COMPLETED' && row.expiresAt && new Date(row.expiresAt) > new Date() ? (
                <a
                  href={`/api/v1/export/${row.id}/download`}
                  className="inline-block"
                  download
                >
                  <Button variant="outline" size="sm">
                    Baixar
                  </Button>
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
