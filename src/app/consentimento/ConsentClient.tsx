'use client'

/**
 * TASK-3/A2 (P0): cliente da tela publica /consentimento.
 *
 * Permite a um usuario anonimo: ver o consentimento atual, alterar as
 * categorias opcionais, salvar, revogar e baixar o comprovante. Reutiliza
 * o contrato canonico de consent:
 *   - escrita: `persistConsent` / `revokeConsent` (@/lib/consent/store)
 *     -> POST /api/v1/consent
 *   - comprovante: GET /api/v1/consent/receipt (@/lib/consent-receipt)
 *
 * Trata loading / erro / sem-consentimento / sucesso e anuncia o
 * salvamento via aria-live (Zero Silencio, Zero Estados Indefinidos).
 */
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DataState, type DataStateStatus } from '@/components/shared/DataState'
import { ConsentReceiptWidget } from '@/components/consent/ConsentReceiptWidget'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { LoadingButton } from '@/components/ui/loading-button'
import { ConfirmationDialog } from '@/components/ui/modal'
import { API_ROUTES } from '@/lib/constants/routes'
import { CONSENT_CATEGORY_META } from '@/lib/constants/consent'
import {
  persistConsent,
  revokeConsent,
  CONSENT_POLICY_VERSION,
  type ConsentCategory,
} from '@/lib/consent/store'
import type { ConsentReceipt } from '@/lib/consent-receipt'

function isRevoked(categories: string[]): boolean {
  return !categories.some((c) => c !== 'necessary')
}

export function ConsentClient() {
  const [status, setStatus] = useState<DataStateStatus>('loading')
  const [receipt, setReceipt] = useState<ConsentReceipt | null>(null)
  const [selected, setSelected] = useState<Record<ConsentCategory, boolean>>({
    necessary: true,
    analytics: false,
    marketing: false,
  })
  const [saving, setSaving] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [announce, setAnnounce] = useState('')

  const loadReceipt = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetch(API_ROUTES.CONSENT_RECEIPT, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })

      if (res.status === 404) {
        // Sem consentimento ancorado neste navegador: estado vazio valido.
        setReceipt(null)
        setStatus('empty')
        return
      }

      if (!res.ok) {
        setStatus('error')
        return
      }

      const json = (await res.json().catch(() => null)) as { data?: ConsentReceipt } | null
      const data = json?.data
      if (!data) {
        setStatus('error')
        return
      }

      setReceipt(data)
      setSelected({
        necessary: true,
        analytics: data.categories.includes('analytics'),
        marketing: data.categories.includes('marketing'),
      })
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void loadReceipt()
  }, [loadReceipt])

  function selectedCategories(): ConsentCategory[] {
    const cats: ConsentCategory[] = ['necessary']
    if (selected.analytics) cats.push('analytics')
    if (selected.marketing) cats.push('marketing')
    return cats
  }

  async function handleSave() {
    setSaving(true)
    try {
      await persistConsent(selectedCategories())
      toast.success('Preferencias de consentimento salvas.')
      setAnnounce('Preferencias de consentimento salvas com sucesso.')
      await loadReceipt()
    } catch {
      toast.error('Nao foi possivel salvar suas preferencias. Tente novamente.')
      setAnnounce('Erro ao salvar preferencias.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke() {
    setRevoking(true)
    try {
      // Revogar = manter apenas o essencial obrigatorio (LGPD: registro append-only).
      await persistConsent(['necessary'])
      revokeConsent()
      setSelected({ necessary: true, analytics: false, marketing: false })
      toast.success('Consentimento revogado. Apenas o essencial permanece ativo.')
      setAnnounce('Consentimento revogado. Apenas categorias essenciais permanecem.')
      await loadReceipt()
    } catch {
      toast.error('Nao foi possivel revogar o consentimento. Tente novamente.')
      setAnnounce('Erro ao revogar consentimento.')
    } finally {
      setRevoking(false)
      setConfirmRevoke(false)
    }
  }

  const preferencesCard = (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Suas preferencias</CardTitle>
        <CardDescription>
          Categorias essenciais sao sempre ativas. Ajuste as opcionais e salve.
          Politica vigente: v{CONSENT_POLICY_VERSION}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="sr-only">Categorias de consentimento</legend>
          {CONSENT_CATEGORY_META.map((cat) => (
            <label
              key={cat.id}
              htmlFor={`consent-${cat.id}`}
              className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
            >
              <input
                id={`consent-${cat.id}`}
                type="checkbox"
                checked={selected[cat.id]}
                disabled={cat.locked || saving || revoking}
                onChange={(e) =>
                  setSelected((prev) => ({ ...prev, [cat.id]: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-input text-primary disabled:opacity-60"
                data-testid={`consent-toggle-${cat.id}`}
              />
              <span>
                <span className="font-medium text-foreground">{cat.label}</span>
                {cat.locked && (
                  <span className="ml-2 text-xs text-muted-foreground">(obrigatorio)</span>
                )}
                <span className="block text-muted-foreground">{cat.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <LoadingButton
            type="button"
            loading={saving}
            onClick={handleSave}
            data-testid="consent-save"
          >
            Salvar preferencias
          </LoadingButton>

          {receipt && !isRevoked(receipt.categories) && (
            <LoadingButton
              type="button"
              variant="ghost"
              loading={revoking}
              onClick={() => setConfirmRevoke(true)}
              data-testid="consent-revoke"
            >
              Revogar consentimento
            </LoadingButton>
          )}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Anuncio acessivel de salvamento/erro (aria-live). */}
      <p className="sr-only" role="status" aria-live="polite" data-testid="consent-live-region">
        {announce}
      </p>

      {preferencesCard}

      <DataState
        status={status}
        onRetry={loadReceipt}
        errorMessage="Nao foi possivel carregar seu comprovante de consentimento."
        empty={
          <Card data-testid="consent-empty">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              <p>Nenhum consentimento registrado neste navegador ainda.</p>
              <p className="mt-1">
                Ajuste suas preferencias acima e clique em{' '}
                <strong className="text-foreground">Salvar preferencias</strong> para gerar
                seu comprovante.
              </p>
            </CardContent>
          </Card>
        }
      >
        {receipt && (
          <ConsentReceiptWidget
            receipt={receipt}
            revoked={isRevoked(receipt.categories)}
          />
        )}
      </DataState>

      <ConfirmationDialog
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={handleRevoke}
        title="Revogar consentimento"
        description="As categorias opcionais (analytics e marketing) serao desativadas. Apenas o essencial permanecera ativo. Voce pode reativar a qualquer momento."
        confirmLabel="Revogar"
        cancelLabel="Cancelar"
        variant="destructive"
        loading={revoking}
      />
    </div>
  )
}
