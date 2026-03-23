'use client'

import { useState, useEffect } from 'react'
import { Plus, FlaskConical, Pencil, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  getCredentials, createCredential, deleteCredential, testCredential,
  getScoringRules, saveScoringRules, DEFAULT_SCORING_RULES
} from '@/actions/config'
import type { CredentialDto, ScoringRule } from '@/actions/config'
import { CredentialProvider, CREDENTIAL_PROVIDER_MAP } from '@/lib/constants/enums'

const credentialSchema = z.object({
  label: z.string().min(1, 'Rótulo é obrigatório.').max(100),
  provider: z.nativeEnum(CredentialProvider),
  apiKey: z.string().min(1, 'Chave de API é obrigatória.'),
})

type CredentialFormData = z.infer<typeof credentialSchema>

function CredentialCard({ cred, onDelete, onTest }: {
  cred: CredentialDto
  onDelete: (id: string, label: string) => void
  onTest: (id: string) => Promise<{ success: boolean; message: string }>
}) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await onTest(cred.id)
      setTestResult(result)
    } catch {
      setTestResult({ success: false, message: 'Erro ao testar credencial.' })
    }
    setTesting(false)
  }

  return (
    <div className={`rounded-lg border bg-card p-4 space-y-3 ${!cred.isActive ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground">{cred.label}</p>
            <Badge variant="outline" className="text-xs">{CREDENTIAL_PROVIDER_MAP[cred.provider].label}</Badge>
            {!cred.isActive && <Badge variant="secondary" className="text-xs">Inativa</Badge>}
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-1">{cred.maskedValue}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleTest}
            disabled={testing}
            aria-label={`Testar credencial ${cred.label}`}
            aria-busy={testing}
            className="h-8 w-8 md:h-8 md:w-8 flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {testing
              ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              : <FlaskConical className="h-4 w-4" aria-hidden="true" />
            }
          </button>
          <button
            onClick={() => onDelete(cred.id, cred.label)}
            aria-label={`Excluir credencial ${cred.label}`}
            className="h-8 w-8 flex items-center justify-center rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {testResult && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
        >
          {testResult.success
            ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            : <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          }
          {testResult.message}
        </div>
      )}
    </div>
  )
}

function ScoringRulesForm() {
  const [rules, setRules] = useState<ScoringRule[]>(DEFAULT_SCORING_RULES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getScoringRules().then(setRules).finally(() => setLoading(false))
  }, [])

  const total = rules.reduce((sum, r) => sum + r.weight, 0)
  const isValid = total === 100

  const handleWeightChange = (dimension: string, value: number) => {
    setRules(prev => prev.map(r => r.dimension === dimension ? { ...r, weight: value } : r))
  }

  const handleSave = async () => {
    if (!isValid) return
    setSaving(true)
    try {
      await saveScoringRules(rules)
      toast.success('Regras de scoring salvas.')
    } catch {
      toast.error('Erro ao salvar regras. Tente novamente.')
    }
    setSaving(false)
  }

  return (
    <div data-testid="admin-config-scoring-section" aria-labelledby="scoring-heading" className="rounded-lg border bg-card p-6 space-y-4">
      <div>
        <h2 id="scoring-heading" className="text-sm font-semibold text-foreground">Regras de Scoring</h2>
        <p className="text-xs text-muted-foreground mt-1">Ajuste os pesos das dimensões de oportunidade</p>
      </div>

      {loading ? (
        <div className="space-y-4" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map(rule => (
            <div key={rule.dimension} className="space-y-1">
              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <div className="md:w-48">
                  <p className="text-sm font-medium text-foreground">{rule.label}</p>
                  <p className="text-xs text-muted-foreground">{rule.description}</p>
                </div>
                <div className="flex-1 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={rule.weight}
                    onChange={e => handleWeightChange(rule.dimension, Number(e.target.value))}
                    aria-label={`Peso para ${rule.label}: ${rule.weight}%`}
                    className="flex-1 accent-primary h-2"
                  />
                  <span className="text-sm font-mono text-foreground w-10 text-right">{rule.weight}%</span>
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className={`text-sm font-medium ${isValid ? 'text-muted-foreground' : 'text-destructive'}`}>
              Total: {total}%{!isValid && ' (deve ser 100%)'}
            </span>
            <button
              data-testid="admin-config-scoring-save-button"
              onClick={handleSave}
              disabled={!isValid || saving}
              aria-busy={saving}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />}
              {saving ? 'Salvando...' : 'Salvar regras'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminConfiguracoesPage() {
  const [credentials, setCredentials] = useState<CredentialDto[]>([])
  const [loadingCreds, setLoadingCreds] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CredentialFormData>({
    resolver: zodResolver(credentialSchema),
    defaultValues: { provider: CredentialProvider.GOOGLE_PLACES },
  })

  useEffect(() => {
    getCredentials().then(setCredentials).finally(() => setLoadingCreds(false))
  }, [])

  const onSubmit = async (data: CredentialFormData) => {
    try {
      await createCredential(data)
      toast.success('Credencial adicionada.')
      reset()
      setCreateOpen(false)
    } catch {
      toast.error('Erro ao adicionar credencial.')
    }
  }

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Excluir credencial "${label}"?`)) return
    try {
      await deleteCredential(id)
      setCredentials(prev => prev.filter(c => c.id !== id))
      toast.success('Credencial excluída.')
    } catch {
      toast.error('Erro ao excluir credencial.')
    }
  }

  const handleTest = async (id: string): Promise<{ success: boolean; message: string }> => {
    return testCredential(id)
  }

  return (
    <div data-testid="admin-config-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Credenciais de API e parâmetros do sistema</p>
      </div>

      {/* Credentials section */}
      <section data-testid="admin-config-credentials-section" aria-labelledby="credentials-heading" className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="credentials-heading" className="text-sm font-semibold text-foreground">Credenciais de API</h2>
            <p className="text-xs text-muted-foreground mt-1">Chaves de acesso aos serviços de dados</p>
          </div>
          <button
            data-testid="admin-config-add-credential-button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Adicionar
          </button>
        </div>

        {loadingCreds ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma credencial configurada. Adicione uma para iniciar coletas.</p>
        ) : (
          <div className="space-y-3">
            {credentials.map(cred => (
              <CredentialCard key={cred.id} cred={cred} onDelete={handleDelete} onTest={handleTest} />
            ))}
          </div>
        )}
      </section>

      {/* Scoring rules */}
      <ScoringRulesForm />

      {/* Create credential modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova credencial</DialogTitle>
          </DialogHeader>
          <form data-testid="admin-config-credential-modal-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cred-provider">Provedor</Label>
              <select
                id="cred-provider"
                disabled={isSubmitting}
                className="w-full h-10 px-3 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary"
                {...register('provider')}
              >
                {Object.entries(CREDENTIAL_PROVIDER_MAP).map(([value, { label }]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cred-label">Rótulo <span aria-hidden="true">*</span></Label>
              <Input
                id="cred-label"
                placeholder="Ex: Google Places Produção"
                autoFocus
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!errors.label}
                {...register('label')}
              />
              {errors.label && <p role="alert" className="text-xs text-destructive">{errors.label.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cred-key">Chave de API <span aria-hidden="true">*</span></Label>
              <Input
                id="cred-key"
                type="password"
                autoComplete="off"
                placeholder="sk-..."
                disabled={isSubmitting}
                aria-required="true"
                aria-invalid={!!errors.apiKey}
                {...register('apiKey')}
              />
              {errors.apiKey && <p role="alert" className="text-xs text-destructive">{errors.apiKey.message}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                data-testid="admin-config-credential-cancel-button"
                onClick={() => setCreateOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                data-testid="admin-config-credential-submit-button"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-80 flex items-center gap-2"
              >
                {isSubmitting && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />}
                {isSubmitting ? 'Criando...' : 'Criar credencial'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
