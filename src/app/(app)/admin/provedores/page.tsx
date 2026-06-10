'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InlineRecoveryPanel, type ProviderHealth } from '@/components/InlineRecoveryPanel'
import { ProviderHealthBadge } from '@/components/ProviderHealthBadge'

// Contrato real de GET /api/v1/admin/providers/status: successResponse(items)
// => { data: ProviderHealth[] } (array direto, mesmo parse do provider-health-context).
interface StatusResponse { data?: ProviderHealth[]; error?: { code: string; message: string } }

export default function ProvedoresPage() {
  const [providers, setProviders] = useState<ProviderHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/v1/admin/providers/status')
      const json = (await res.json().catch(() => ({}))) as StatusResponse
      if (!res.ok) { setError(json.error?.message ?? 'Erro ao carregar provedores.'); return }
      setProviders(Array.isArray(json.data) ? json.data : [])
    } catch { setError('Erro de rede.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Provedores</h1>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>Atualizar</Button>
      </div>

      {loading && (
        <div className="flex justify-center py-12" aria-label="Carregando provedores...">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}
        </div>
      )}
      {!loading && !error && providers.length === 0 && (
        <div role="status" className="text-center py-12 text-sm text-muted-foreground">Nenhum provedor configurado.</div>
      )}
      {!loading && !error && providers.length > 0 && (
        <div className="space-y-4">
          {providers.map((provider) => (
            <div key={provider.source} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="text-sm font-medium text-muted-foreground">{provider.source}</span>
                <ProviderHealthBadge provider={provider.source} />
              </div>
              <InlineRecoveryPanel
                health={provider}
                onRecovered={() => void load()}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
