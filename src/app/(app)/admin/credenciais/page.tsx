'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Key,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { InlineRecoveryPanel, type ProviderHealth } from '@/components/InlineRecoveryPanel'
import { PROVIDER_CATALOG } from '@/lib/constants/provider-catalog'
import { CREDENTIAL_PROVIDER_MAP } from '@/lib/constants/enums'
import { toast } from 'sonner'

interface ApiCredentialSafe {
  id: string
  provider: string
  label: string
  maskedValue: string
  isActive: boolean
  usageCount: number
  usageResetAt: string | null
  cost: number | null
  auditSummary: string | null
  lastValidatedAt: string | null
  createdAt: string
  updatedAt: string
}

interface CredentialsResponse {
  data?: ApiCredentialSafe[]
  error?: { code: string; message: string }
}

interface StatusResponse {
  data?: ProviderHealth[]
  error?: { code: string; message: string }
}

const APIFY_COVERED_PROVIDERS = new Set([
  'INSTAGRAM_APIFY',
  'FACEBOOK_INTERMEDIARY',
  'LINKEDIN_COMPANY',
])

const HEADLESS_NO_CREDENTIAL_PROVIDERS = new Set([
  'APONTADOR',
  'GUIA_MAIS',
])

const HIDDEN_PROVIDER_CARDS = new Set([
  ...APIFY_COVERED_PROVIDERS,
  ...HEADLESS_NO_CREDENTIAL_PROVIDERS,
])

const PROVIDER_OPTIONS = [
  ...PROVIDER_CATALOG
    .filter((provider) => !HIDDEN_PROVIDER_CARDS.has(provider.source))
    .map((provider) => ({
      value: provider.source,
      label: provider.label,
    })),
  { value: 'CUSTOM', label: CREDENTIAL_PROVIDER_MAP.CUSTOM.label },
]

const STATUS_ORDER: Record<ProviderHealth['status'], number> = {
  UP: 0,
  DEGRADED: 1,
  PAUSED: 2,
  DOWN: 3,
  UNCONFIGURED: 4,
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Nunca'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR')
}

function buildFallbackHealth(cred: ApiCredentialSafe): ProviderHealth {
  return {
    source: cred.provider,
    label: cred.label ?? cred.provider,
    status: cred.isActive ? 'UP' : 'PAUSED',
    latencyMs: null,
    quotaRemaining: null,
    rateLimitResetAt: cred.usageResetAt,
    lastError: null,
    fallbackProvider: null,
    updatedAt: cred.updatedAt,
  }
}

export default function CredenciaisPage() {
  const [creds, setCreds] = useState<ApiCredentialSafe[]>([])
  const [providers, setProviders] = useState<ProviderHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCred, setEditingCred] = useState<ApiCredentialSafe | null>(null)
  const [formProvider, setFormProvider] = useState('')
  const [formApiKey, setFormApiKey] = useState('')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmCred, setConfirmCred] = useState<ApiCredentialSafe | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [credentialsRes, statusRes] = await Promise.all([
        fetch('/api/v1/admin/config/credentials'),
        fetch('/api/v1/admin/providers/status'),
      ])

      const credentialsJson = (await credentialsRes.json().catch(() => ({}))) as CredentialsResponse
      const statusJson = (await statusRes.json().catch(() => ({}))) as StatusResponse

      if (!credentialsRes.ok) {
        setError(credentialsJson.error?.message ?? 'Erro ao carregar credenciais.')
        return
      }
      if (!statusRes.ok) {
        setError(statusJson.error?.message ?? 'Erro ao carregar status dos provedores.')
        return
      }

      setCreds(Array.isArray(credentialsJson.data) ? credentialsJson.data : [])
      setProviders(Array.isArray(statusJson.data) ? statusJson.data : [])
    } catch {
      setError('Erro de rede ao carregar provedores.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  const credentialByProvider = useMemo(
    () => new Map(creds.map((cred) => [cred.provider, cred])),
    [creds],
  )

  const unifiedProviders = useMemo(() => {
    const items = (providers.length > 0 ? providers : creds.map(buildFallbackHealth))
      .filter((provider) => !HIDDEN_PROVIDER_CARDS.has(provider.source))
    return [...items].sort((a, b) => {
      const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      if (statusDiff !== 0) return statusDiff
      return a.label.localeCompare(b.label, 'pt-BR')
    })
  }, [creds, providers])

  function openCreate(provider?: string) {
    setEditingCred(null)
    setFormProvider(provider ?? '')
    setFormApiKey('')
    setDialogOpen(true)
  }

  function openEdit(cred: ApiCredentialSafe) {
    setEditingCred(cred)
    setFormProvider(cred.provider)
    setFormApiKey('')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!formProvider.trim()) {
      toast.error('Selecione ou informe o provedor.')
      return
    }
    if (!formApiKey.trim()) {
      toast.error('A chave de API e obrigatoria.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(
        `/api/v1/admin/config/credentials/${encodeURIComponent(formProvider)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: formApiKey }),
        },
      )
      const json = (await res.json().catch(() => ({}))) as {
        error?: { code: string; message: string }
      }
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Erro ao salvar credencial.')
        return
      }
      toast.success(editingCred ? 'Credencial atualizada.' : 'Credencial criada.')
      setDialogOpen(false)
      await load()
    } catch {
      toast.error('Erro de rede ao salvar credencial.')
    } finally {
      setSaving(false)
    }
  }

  function openDelete(cred: ApiCredentialSafe) {
    setConfirmCred(cred)
    setConfirmOpen(true)
  }

  async function handleDelete() {
    if (!confirmCred) return
    setDeleting(confirmCred.provider)
    try {
      const res = await fetch(
        `/api/v1/admin/config/credentials/${encodeURIComponent(confirmCred.provider)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { code: string; message: string }
        }
        toast.error(json.error?.message ?? 'Erro ao remover credencial.')
        return
      }
      toast.success('Credencial removida.')
      setConfirmOpen(false)
      await load()
    } catch {
      toast.error('Erro de rede ao remover credencial.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Credenciais e provedores</h1>
          <p className="text-sm text-muted-foreground">
            Configure chaves de API, acompanhe status e opere cada provider em um unico lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => openCreate()} data-testid="create-credential">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Nova credencial
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12" aria-label="Carregando provedores...">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {!loading && !error && unifiedProviders.length === 0 && (
        <div role="status" className="py-12 text-center">
          <Key className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Nenhum provedor encontrado.</p>
        </div>
      )}

      {!loading && !error && unifiedProviders.length > 0 && (
        <div className="space-y-4">
          {unifiedProviders.map((provider) => {
            const cred = credentialByProvider.get(provider.source)
            return (
              <InlineRecoveryPanel
                key={provider.source}
                health={provider}
                onRecovered={() => void load()}
                credentialSummary={
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Chave cadastrada</dt>
                      <dd className="font-mono font-medium">
                        {cred?.maskedValue ?? 'Não cadastrada'}
                      </dd>
                    </div>
                    {cred?.lastValidatedAt ? (
                      <div>
                        <dt className="text-muted-foreground">Último teste</dt>
                        <dd className="font-medium">{formatTimestamp(cred.lastValidatedAt)}</dd>
                      </div>
                    ) : null}
                    {cred ? (
                      <div>
                        <dt className="text-muted-foreground">Credencial</dt>
                        <dd className="font-medium">{cred.isActive ? 'Ativa' : 'Inativa'}</dd>
                      </div>
                    ) : null}
                  </dl>
                }
                credentialActions={
                  cred ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(cred)}
                        data-testid={`edit-cred-${cred.provider}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Editar chave
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openDelete(cred)}
                        disabled={deleting === cred.provider}
                        className="hover:bg-destructive/10 hover:text-destructive"
                        data-testid={`delete-cred-${cred.provider}`}
                      >
                        {deleting === cred.provider ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Remover chave
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openCreate(provider.source)}
                      data-testid={`add-cred-${provider.source}`}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Cadastrar chave
                    </Button>
                  )
                }
              />
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCred ? 'Editar credencial' : 'Nova credencial'}</DialogTitle>
            <DialogDescription>
              {editingCred
                ? 'Atualize a chave de API do provider.'
                : 'Selecione o provider e informe a chave de API.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cred-provider">Provider</Label>
              {editingCred ? (
                <Input
                  id="cred-provider"
                  value={editingCred.label ?? editingCred.provider}
                  disabled
                />
              ) : (
                <Select value={formProvider} onValueChange={(value) => setFormProvider(value ?? '')}>
                  <SelectTrigger id="cred-provider">
                    <SelectValue placeholder="Selecione um provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cred-api-key">Chave de API</Label>
              <Input
                id="cred-api-key"
                type="password"
                value={formApiKey}
                placeholder="Cole a chave do provider"
                onChange={(event) => setFormApiKey(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !formProvider.trim() || !formApiKey.trim()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {editingCred ? 'Salvar alterações' : 'Criar credencial'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open) setConfirmCred(null)
        }}
        title="Remover credencial"
        description={
          <span>
            Tem certeza que deseja remover a credencial{' '}
            <strong>{confirmCred?.label ?? confirmCred?.provider}</strong>? Esta acao nao pode ser desfeita.
          </span>
        }
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        danger
        loading={!!deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
