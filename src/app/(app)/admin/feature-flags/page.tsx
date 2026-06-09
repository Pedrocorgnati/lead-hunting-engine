'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2, ToggleLeft, ToggleRight, History, Download, Filter } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface FeatureFlag {
  id: string
  name: string
  description: string | null
  enabled: boolean
  ownerModule: string | null
  tags: string[]
  defaultValue: unknown
  createdAt: string
}

interface FlagsResponse {
  data?: { flags: FeatureFlag[] } | FeatureFlag[]
  error?: { code: string; message: string }
}

interface ChangeItem {
  id: string
  env: string
  kind: string
  beforeValue: unknown
  afterValue: unknown
  reason: string
  changedByEmail: string
  correlationId: string | null
  createdAt: string
}

interface ChangesResponse {
  data?: { changes: ChangeItem[] }
  error?: { code: string; message: string }
}

interface PendingToggle {
  flagId: string
  name: string
  newEnabled: boolean
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingToggle | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('flags')
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null)
  const [changes, setChanges] = useState<ChangeItem[]>([])
  const [changesLoading, setChangesLoading] = useState(false)
  const [changesError, setChangesError] = useState<string | null>(null)
  const [filterEnv, setFilterEnv] = useState<string>('all')
  const [filterKind, setFilterKind] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/feature-flags')
      const json = (await res.json().catch(() => ({}))) as FlagsResponse
      if (!res.ok) {
        setError(json.error?.message ?? 'Erro ao carregar flags.')
        return
      }
      const list = Array.isArray(json.data)
        ? json.data
        : (json.data as { flags: FeatureFlag[] })?.flags ?? []
      setFlags(list)
    } catch {
      setError('Erro de rede ao carregar flags.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const loadChanges = useCallback(async (flagName: string) => {
    setChangesLoading(true)
    setChangesError(null)
    try {
      const params = new URLSearchParams()
      if (filterEnv !== 'all') params.set('env', filterEnv)
      if (filterKind !== 'all') params.set('kind', filterKind)
      if (filterDateFrom) params.set('from', filterDateFrom)
      if (filterDateTo) params.set('to', filterDateTo)
      const qs = params.toString()
      const res = await fetch(`/api/v1/admin/feature-flags/${encodeURIComponent(flagName)}/changes${qs ? '?' + qs : ''}`)
      const json = (await res.json().catch(() => ({}))) as ChangesResponse
      if (!res.ok) {
        setChangesError(json.error?.message ?? 'Erro ao carregar auditoria.')
        return
      }
      setChanges(json.data?.changes ?? [])
    } catch {
      setChangesError('Erro de rede ao carregar auditoria.')
    } finally {
      setChangesLoading(false)
    }
  }, [filterEnv, filterKind, filterDateFrom, filterDateTo])

  useEffect(() => {
    if (activeTab === 'audit' && selectedFlag) {
      void loadChanges(selectedFlag.name)
    }
  }, [activeTab, selectedFlag, loadChanges])

  async function confirmToggle() {
    if (!pending) return
    const trimmed = reason.trim()
    if (trimmed.length < 10) {
      setReasonError('O motivo e obrigatorio e deve ter pelo menos 10 caracteres.')
      return
    }
    setToggling(pending.flagId)
    setReasonError(null)
    try {
      const res = await fetch(`/api/v1/admin/feature-flags/${encodeURIComponent(pending.name)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: pending.newEnabled, reason: trimmed }),
      })
      if (!res.ok) {
        toast.error('Erro ao alterar flag.')
        return
      }
      toast.success(`Flag ${pending.name} ${pending.newEnabled ? 'ativada' : 'desativada'}.`)
      setFlags((prev) =>
        prev.map((f) => (f.id === pending.flagId ? { ...f, enabled: pending.newEnabled } : f))
      )
    } catch {
      toast.error('Erro de rede.')
    } finally {
      setToggling(null)
      setPending(null)
      setReason('')
    }
  }

  function closeToggleDialog() {
    setPending(null)
    setReason('')
    setReasonError(null)
  }

  const kindLabels: Record<string, string> = {
    created: 'Criada',
    updated_default: 'Valor padrao alterado',
    env_value_set: 'Valor de ambiente definido',
    env_value_cleared: 'Valor de ambiente removido',
    metadata_updated: 'Metadados atualizados',
    deleted: 'Removida',
  }

  function exportChanges(format: 'csv' | 'json') {
    if (!selectedFlag || changes.length === 0) return
    const rows = changes.map((c) => ({
      Data: new Date(c.createdAt).toLocaleString('pt-BR'),
      Ambiente: c.env,
      Acao: kindLabels[c.kind] ?? c.kind,
      Motivo: c.reason,
      Autor: c.changedByEmail,
      CorrelationId: c.correlationId ?? '-',
    }))
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `auditoria-${selectedFlag.name}.json`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const headers = Object.keys(rows[0]).join(',')
      const csv = [headers, ...rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `auditoria-${selectedFlag.name}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Feature flags</h1>
        <p className="text-sm text-muted-foreground">
          Controle ativacao de funcionalidades em tempo real.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="flags">Flags</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="flags" className="space-y-4">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2
                className="h-6 w-6 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          )}
          {!loading && error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {error}
            </div>
          )}
          {!loading && !error && flags.length === 0 && (
            <div
              role="status"
              className="text-center py-12 text-sm text-muted-foreground"
            >
              Nenhuma flag configurada.
            </div>
          )}
          {!loading && !error && flags.length > 0 && (
            <div className="space-y-3">
              {flags.map((flag) => (
                <Card key={flag.id} data-testid={`flag-${flag.name}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-mono font-medium">
                          {flag.name}
                        </CardTitle>
                        {flag.description && (
                          <CardDescription className="text-xs">
                            {flag.description}
                          </CardDescription>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {flag.ownerModule && (
                            <Badge variant="outline" className="text-[10px]">
                              Modulo: {flag.ownerModule}
                            </Badge>
                          )}
                          {flag.tags?.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={flag.enabled ? 'secondary' : 'outline'}>
                          {flag.enabled ? 'Ativado' : 'Desativado'}
                        </Badge>
                        <button
                          type="button"
                          onClick={() =>
                            setPending({
                              flagId: flag.id,
                              name: flag.name,
                              newEnabled: !flag.enabled,
                            })
                          }
                          disabled={toggling === flag.id}
                          aria-label={
                            flag.enabled
                              ? `Desativar ${flag.name}`
                              : `Ativar ${flag.name}`
                          }
                          data-testid={`toggle-${flag.name}`}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {toggling === flag.id ? (
                            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                          ) : flag.enabled ? (
                            <ToggleRight
                              className="h-6 w-6 text-emerald-600"
                              aria-hidden
                            />
                          ) : (
                            <ToggleLeft className="h-6 w-6" aria-hidden />
                          )}
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Selecione uma flag para visualizar o historico de alteracoes.
            </p>
          </div>

          {flags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {flags.map((flag) => (
                <Button
                  key={flag.id}
                  variant={selectedFlag?.id === flag.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedFlag(flag)}
                >
                  {flag.name}
                </Button>
              ))}
            </div>
          )}

          {selectedFlag && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-medium">
                  Historico: {selectedFlag.name}
                </h2>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportChanges('csv')} disabled={changes.length === 0}>
                    <Download className="mr-1 h-3 w-3" />
                    CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportChanges('json')} disabled={changes.length === 0}>
                    <Download className="mr-1 h-3 w-3" />
                    JSON
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <Filter className="h-3 w-3 text-muted-foreground" />
                <select
                  className="text-xs border rounded px-2 py-1 bg-background"
                  value={filterEnv}
                  onChange={(e) => setFilterEnv(e.target.value)}
                  aria-label="Filtrar por ambiente"
                >
                  <option value="all">Todos ambientes</option>
                  <option value="development">Development</option>
                  <option value="preview">Preview</option>
                  <option value="production">Production</option>
                </select>
                <select
                  className="text-xs border rounded px-2 py-1 bg-background"
                  value={filterKind}
                  onChange={(e) => setFilterKind(e.target.value)}
                  aria-label="Filtrar por acao"
                >
                  <option value="all">Todas acoes</option>
                  {Object.entries(kindLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input
                  type="date"
                  className="text-xs border rounded px-2 py-1 bg-background"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  aria-label="De"
                />
                <input
                  type="date"
                  className="text-xs border rounded px-2 py-1 bg-background"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  aria-label="Ate"
                />
              </div>

              {changesLoading && (
                <div className="flex justify-center py-8">
                  <Loader2
                    className="h-5 w-5 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
              )}

              {changesError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-center gap-2"
                >
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  {changesError}
                </div>
              )}

              {!changesLoading && !changesError && changes.length === 0 && (
                <div
                  role="status"
                  className="text-center py-8 text-sm text-muted-foreground"
                >
                  Nenhuma alteracao registrada para esta flag.
                </div>
              )}

              {!changesLoading && !changesError && changes.length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Ambiente</TableHead>
                        <TableHead className="text-xs">Acao</TableHead>
                        <TableHead className="text-xs">Motivo</TableHead>
                        <TableHead className="text-xs">Autor</TableHead>
                        <TableHead className="text-xs">Correlation ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {changes.map((change) => (
                        <TableRow key={change.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(change.createdAt).toLocaleString('pt-BR')}
                          </TableCell>
                          <TableCell className="text-xs">{change.env}</TableCell>
                          <TableCell className="text-xs">
                            {kindLabels[change.kind] ?? change.kind}
                          </TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">
                            {change.reason}
                          </TableCell>
                          <TableCell className="text-xs">
                            {change.changedByEmail}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {change.correlationId ?? '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!pending} onOpenChange={(open) => { if (!open) closeToggleDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.newEnabled ? 'Ativar feature flag' : 'Desativar feature flag'}
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja {pending?.newEnabled ? 'ativar' : 'desativar'} &quot;
              {pending?.name}&quot;?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="toggle-reason">Motivo da alteracao *</Label>
            <Textarea
              id="toggle-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (reasonError) setReasonError(null)
              }}
              placeholder="Descreva o motivo da alteracao (minimo 10 caracteres)..."
              rows={3}
              aria-invalid={reasonError ? 'true' : 'false'}
              aria-describedby={reasonError ? 'toggle-reason-error' : undefined}
            />
            <div
              id="toggle-reason-error"
              aria-live="polite"
              role="status"
              className="min-h-5 text-sm text-destructive"
            >
              {reasonError}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeToggleDialog} disabled={!!toggling}>
              Cancelar
            </Button>
            <Button
              variant={pending?.newEnabled ? 'default' : 'destructive'}
              onClick={() => void confirmToggle()}
              disabled={!!toggling}
            >
              {toggling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                'Confirmar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
