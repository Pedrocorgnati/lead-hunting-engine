'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calendar,
  Clock,
  Loader2,
  Package,
  Save,
  Tag,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Operator {
  id: string
  email: string
  name: string | null
  role: string
  deactivatedAt: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface Metrics {
  collectionsCount: number
  leadsReviewed: number
  exportsCount: number
  failureRate: number
  lastActiveAt: string | null
}

interface AuditLog {
  id: string
  action: string
  resource: string
  resourceId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

type LoadState = 'idle' | 'loading' | 'error' | 'ready'

export default function OperadorDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [state, setState] = useState<LoadState>('idle')
  const [operator, setOperator] = useState<Operator | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsPage, setLogsPage] = useState(1)
  const [logsLimit] = useState(10)
  const [tagInput, setTagInput] = useState('')
  const [tagsDraft, setTagsDraft] = useState<string[]>([])
  const [savingTags, setSavingTags] = useState(false)

  const loadAll = useCallback(async () => {
    setState('loading')
    try {
      const [userRes, metricsRes, logsRes] = await Promise.all([
        fetch(`/api/v1/admin/users/${id}`),
        fetch(`/api/v1/admin/users/${id}/metrics`),
        fetch(`/api/v1/admin/users/${id}/audit-log?page=${logsPage}&limit=${logsLimit}`),
      ])

      if (!userRes.ok) {
        const json = await userRes.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Erro ao carregar operador.')
      }

      const userJson = (await userRes.json()) as { data: Operator }
      const metricsJson = (await metricsRes.json()) as { data: Metrics }
      const logsJson = (await logsRes.json()) as { data: AuditLog[]; meta: { total: number } }

      setOperator(userJson.data)
      setTagsDraft(userJson.data.tags ?? [])
      setMetrics(metricsJson.data)
      setLogs(logsJson.data ?? [])
      setLogsTotal(logsJson.meta?.total ?? 0)
      setState('ready')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado')
      setState('error')
    }
  }, [id, logsPage, logsLimit])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const metricsCards = useMemo(
    () => [
      {
        label: 'Coleções',
        value: metrics?.collectionsCount ?? 0,
        icon: Package,
        testId: 'metric-collections',
      },
      {
        label: 'Leads revisados',
        value: metrics?.leadsReviewed ?? 0,
        icon: Users,
        testId: 'metric-leads',
      },
      {
        label: 'Exports',
        value: metrics?.exportsCount ?? 0,
        icon: BarChart3,
        testId: 'metric-exports',
      },
      {
        label: 'Taxa de falha',
        value: `${metrics?.failureRate ?? 0}%`,
        icon: AlertCircle,
        testId: 'metric-failure-rate',
      },
    ],
    [metrics],
  )

  async function saveCohortTags() {
    if (!operator) return
    setSavingTags(true)
    try {
      const res = await fetch(`/api/v1/admin/users/${id}/cohort`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: tagsDraft }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? 'Erro ao salvar tags.')
      }
      const json = (await res.json()) as { data: Operator }
      setOperator(json.data)
      setTagsDraft(json.data.tags ?? [])
      toast.success('Tags de cohort atualizadas.')
      void loadAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setSavingTags(false)
    }
  }

  function addTag() {
    const raw = tagInput.trim().toLowerCase()
    if (!raw) return
    if (tagsDraft.includes(raw)) {
      setTagInput('')
      return
    }
    if (tagsDraft.length >= 20) {
      toast.error('Limite de 20 tags atingido.')
      return
    }
    setTagsDraft((prev) => [...prev, raw])
    setTagInput('')
  }

  function removeTag(tag: string) {
    setTagsDraft((prev) => prev.filter((t) => t !== tag))
  }

  function formatDate(iso: string | null | undefined) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR')
  }

  if (state === 'error') {
    return (
      <div className="space-y-6 p-6">
        <Button variant="outline" size="sm" onClick={() => router.push('/admin/operadores')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Falha ao carregar detalhes do operador.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6" data-testid="operador-detail-page">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/operadores"
          className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-medium hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Voltar
        </Link>
      </div>

      {state !== 'ready' || !operator ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold" data-testid="operador-name">
              {operator.name ?? operator.email}
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="operador-email">
              {operator.email}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={operator.role === 'ADMIN' ? 'default' : 'secondary'}>
                {operator.role}
              </Badge>
              {operator.deactivatedAt ? (
                <Badge variant="destructive">Desativado</Badge>
              ) : (
                <Badge variant="outline">Ativo</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Membro desde {formatDate(operator.createdAt)}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metricsCards.map((m) => (
              <Card key={m.testId} data-testid={m.testId}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {m.label}
                  </CardTitle>
                  <m.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{m.value}</div>
                </CardContent>
              </Card>
            ))}
            <Card data-testid="metric-last-active">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Última atividade
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium">
                  {formatDate(metrics?.lastActiveAt)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card data-testid="cohort-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4" aria-hidden="true" />
                Cohort tags
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {tagsDraft.length === 0 && (
                  <span className="text-sm text-muted-foreground">Nenhuma tag.</span>
                )}
                {tagsDraft.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={`Remover tag ${tag}`}
                      className="rounded-full hover:bg-muted"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Nova tag (Enter para adicionar)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag()
                    }
                  }}
                  className="max-w-xs"
                  data-testid="cohort-tag-input"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>
                  Adicionar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveCohortTags}
                  disabled={savingTags}
                  data-testid="cohort-save-btn"
                >
                  {savingTags ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Salvar tags
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="audit-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                Auditoria recente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum registro de auditoria.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Ação</TableHead>
                        <TableHead>Recurso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{log.action}</TableCell>
                          <TableCell className="text-xs">{log.resource}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-4 flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={logsPage <= 1}
                      onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Página {logsPage} de {Math.max(1, Math.ceil(logsTotal / logsLimit))}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={logsPage * logsLimit >= logsTotal}
                      onClick={() => setLogsPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
