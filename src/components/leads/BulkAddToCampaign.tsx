'use client'

/**
 * outreach-engine (3o passe de UX, Codex): caminho de MENOR cliques de
 * "leads prontos -> email enviado", direto na lista de leads. O operador
 * escolhe uma campanha pronta e adiciona os leads elegíveis em lote, com
 * RESULTADO VISÍVEL (quantos entraram, quantos foram pulados e por quê) —
 * em vez de abrir lead a lead ou usar um "enfileirar 50" cego.
 *
 * Usa o enqueue da campanha (escopado por nicho/elegibilidade da própria
 * campanha + envelope de qualidade). Admin-only: some para não-admin.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Routes } from '@/lib/constants'

interface Campaign { id: string; name: string; niche: string | null }

export function BulkAddToCampaign() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [selected, setSelected] = useState('')
  const [limit, setLimit] = useState(50)
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: Array<{ reason: string }> } | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/v1/admin/outreach/campaigns', { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((j) => {
        if (!alive) return
        const list: Campaign[] = (j.data?.campaigns ?? []).filter((c: Campaign & { status: string }) => c.status === 'ACTIVE')
        setCampaigns(list); setSelected(list[0]?.id ?? '')
      })
      .catch(() => { if (alive) setHidden(true) })
    return () => { alive = false }
  }, [])

  const run = useCallback(async () => {
    if (!selected) return
    setBusy(true); setResult(null)
    try {
      const res = await fetch(`/api/v1/admin/outreach/campaigns/${selected}/actions`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enqueue', limit }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      setResult({ created: json.data?.created ?? 0, skipped: json.data?.skipped ?? [] })
    } catch {
      setResult({ created: 0, skipped: [{ reason: 'falha ao adicionar — verifique se a campanha está liberada' }] })
    } finally {
      setBusy(false)
    }
  }, [selected, limit])

  if (hidden || campaigns === null) return null

  if (campaigns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground" data-testid="bulk-add-campaign-empty">
        Para enviar emails em lote, crie e libere uma campanha no{' '}
        <Link href={Routes.ADMIN_OUTREACH} className="underline">Centro de Outreach</Link>.
      </div>
    )
  }

  const topReasons = result ? [...new Set(result.skipped.map((s) => s.reason))].slice(0, 3) : []

  return (
    <div className="rounded-lg border p-3" data-testid="bulk-add-campaign">
      <div className="flex flex-wrap items-end gap-2">
        <span className="text-sm font-medium">Enviar em lote:</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          data-testid="bulk-add-campaign-select"
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          aria-label="Campanha de destino"
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.niche ? ` · ${c.niche}` : ''}</option>
          ))}
        </select>
        <input
          type="number" min={1} max={500} value={limit}
          onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 50)))}
          className="h-9 w-20 rounded-lg border border-border bg-background px-3 text-sm"
          aria-label="Quantos leads no máximo"
          data-testid="bulk-add-campaign-limit"
        />
        <Button size="sm" disabled={busy || !selected} onClick={() => void run()} data-testid="bulk-add-campaign-submit">
          Adicionar prontos à campanha
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Adiciona os leads elegíveis da campanha (com e-mail, integridade ok, não suprimidos, do nicho da campanha). O email com o problema é gerado automaticamente.
      </p>
      {result && (
        <div className="mt-2 text-xs" data-testid="bulk-add-campaign-result">
          <strong>{result.created}</strong> adicionado(s){result.skipped.length > 0 && <> · <strong>{result.skipped.length}</strong> pulado(s)</>}
          {topReasons.length > 0 && <span className="text-muted-foreground"> — {topReasons.join(' · ')}</span>}
        </div>
      )}
    </div>
  )
}
