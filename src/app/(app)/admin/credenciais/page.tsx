'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Key,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

const PROVIDER_OPTIONS = [
  { value: 'GOOGLE_PLACES', label: 'Google Places' },
  { value: 'OUTSCRAPER', label: 'Outscraper' },
  { value: 'APIFY', label: 'Apify' },
  { value: 'OPENAI', label: 'OpenAI' },
  { value: 'ANTHROPIC', label: 'Anthropic' },
  { value: 'HERE_MAPS', label: 'HERE Maps' },
  { value: 'TOMTOM', label: 'TomTom' },
  { value: 'CUSTOM', label: 'Custom' },
]

export default function CredenciaisPage() {
  const [creds, setCreds] = useState<ApiCredentialSafe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
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
      const res = await fetch('/api/v1/admin/config/credentials')
      const json = (await res.json().catch(() => ({}))) as {
        data?: ApiCredentialSafe[]
        error?: { code: string; message: string }
      }
      if (!res.ok) {
        setError(json.error?.message ?? 'Erro ao carregar credenciais.')
        return
      }
      setCreds(Array.isArray(json.data) ? json.data : [])
    } catch {
      setError('Erro de rede ao carregar credenciais.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleTest(provider: string) {
    setTesting(provider)
    try {
      const res = await fetch(
        `/api/v1/admin/config/credentials/${encodeURIComponent(provider)}/test`,
        { method: 'POST' }
      )
      const json = (await res.json().catch(() => ({}))) as {
        data?: { ok: boolean; message: string }
        error?: { code: string; message: string }
      }
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Falha no teste de credencial.')
        return
      }
      if (json.data?.ok) {
        toast.success(json.data.message)
      } else {
        toast.error(json.data?.message ?? 'Teste falhou.')
      }
      await load()
    } catch {
      toast.error('Erro de rede ao testar credencial.')
    } finally {
      setTesting(null)
    }
  }

  function openCreate() {
    setEditingCred(null)
    setFormProvider('')
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
        }
      )
      const json = (await res.json().catch(() => ({}))) as {
        data?: ApiCredentialSafe
        error?: { code: string; message: string }
      }
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Erro ao salvar credencial.')
        return
      }
      toast.success(
        editingCred
          ? 'Credencial atualizada com sucesso.'
          : 'Credencial criada com sucesso.'
      )
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
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { code: string; message: string }
        }
        toast.error(json.error?.message ?? 'Erro ao remover credencial.')
        return
      }
      toast.success('Credencial removida com sucesso.')
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Credenciais de provedores</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as chaves de API para cada provedor de dados.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} data-testid="create-credential">
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          Nova credencial
        </Button>
      </div>

      {loading && (
        <div
          className="flex justify-center py-12"
          aria-label="Carregando credenciais..."
        >
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
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {!loading && !error && creds.length === 0 && (
        <div role="status" className="text-center py-12">
          <Key
            className="h-8 w-8 text-muted-foreground mx-auto mb-2"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            Nenhuma credencial configurada.
          </p>
        </div>
      )}

      {!loading && !error && creds.length > 0 && (
        <div className="space-y-3">
          {creds.map((cred) => (
            <Card key={cred.provider} data-testid={`cred-${cred.provider}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm font-medium">
                      {cred.label ?? cred.provider}
                    </CardTitle>
                    <Badge variant={cred.isActive ? 'secondary' : 'outline'}>
                      {cred.isActive ? 'Ativa' : 'Inativa'}
                    </Badge>
                    {cred.isActive && (
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!testing}
                      onClick={() => void handleTest(cred.provider)}
                      data-testid={`test-cred-${cred.provider}`}
                    >
                      {testing === cred.provider ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden
                        />
                      ) : null}
                      Testar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(cred)}
                      data-testid={`edit-cred-${cred.provider}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDelete(cred)}
                      data-testid={`delete-cred-${cred.provider}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                <p className="text-xs text-muted-foreground">
                  Valor: <span className="font-mono">{cred.maskedValue}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Usos: {cred.usageCount}
                  {cred.usageResetAt
                    ? ` (reset em ${new Date(cred.usageResetAt).toLocaleDateString('pt-BR')})`
                    : ''}
                </p>
                {cred.cost != null && (
                  <p className="text-xs text-muted-foreground">
                    Custo acumulado: US${cred.cost.toFixed(4)}
                  </p>
                )}
                {cred.lastValidatedAt && (
                  <p className="text-xs text-muted-foreground">
                    Ultima validacao:{' '}
                    {new Date(cred.lastValidatedAt).toLocaleString('pt-BR')}
                  </p>
                )}
                {cred.auditSummary && (
                  <p className="text-xs text-muted-foreground truncate" title={cred.auditSummary}>
                    Audit: {cred.auditSummary}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Atualizado em:{' '}
                  {new Date(cred.updatedAt).toLocaleString('pt-BR')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCred ? 'Editar credencial' : 'Nova credencial'}
            </DialogTitle>
            <DialogDescription>
              {editingCred
                ? 'Atualize a chave de API do provedor selecionado.'
                : 'Selecione o provedor e informe a chave de API.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cred-provider">Provedor</Label>
              {editingCred ? (
                <Input
                  id="cred-provider"
                  value={editingCred.label ?? editingCred.provider}
                  disabled
                />
              ) : (
                <Select
                  value={formProvider}
                  onValueChange={(v) => setFormProvider(v ?? '')}
                >
                  <SelectTrigger id="cred-provider">
                    <SelectValue placeholder="Selecione um provedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
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
                placeholder="Informe a chave de API"
                onChange={(e) => setFormApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !formProvider.trim() || !formApiKey.trim()}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" aria-hidden />
              ) : null}
              {editingCred ? 'Salvar alteracoes' : 'Criar credencial'}
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
            <strong>{confirmCred?.label ?? confirmCred?.provider}</strong>? Esta
            acao nao pode ser desfeita.
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
