'use client'

/**
 * outreach-engine (brainstorm 06-10, fix da revisão + 3o passe de UX):
 * caminho "do lead pronto para o envio". No detalhe do lead, depois de ver o
 * pitch (o problema), o operador adiciona este lead a uma campanha que de fato
 * envia, em 1 clique.
 *
 * Correções do review de UX (Codex):
 *  - Só lista campanhas que REALMENTE enviam (ACTIVE); rascunhos não aparecem
 *    como opção enganosa.
 *  - Sem campanha pronta: link direto para o Centro de Outreach.
 *  - Resultado VISÍVEL (entrou / foi pulado + motivo).
 *  - Deixa claro que o pitch gerado aqui será o corpo do email.
 *
 * Campanhas são admin-scoped: se o usuário não for admin (401/403), a seção
 * some silenciosamente (é uma função de admin).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { Routes } from '@/lib/constants'

interface Campaign { id: string; name: string; status: string; dryRun: boolean }

export function AddToCampaignButton({ leadId }: { leadId: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [selected, setSelected] = useState('')
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/v1/admin/outreach/campaigns', { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((j) => {
        if (!alive) return
        // Só campanhas ATIVAS de fato enviam (enqueue exige ACTIVE + aprovação).
        const list: Campaign[] = (j.data?.campaigns ?? []).filter((c: Campaign) => c.status === 'ACTIVE')
        setCampaigns(list)
        setSelected(list[0]?.id ?? '')
      })
      .catch(() => { if (alive) setHidden(true) })
    return () => { alive = false }
  }, [])

  const add = useCallback(async () => {
    if (!selected) return
    setBusy(true); setResult(null)
    try {
      const res = await fetch(`/api/v1/admin/outreach/campaigns/${selected}/actions`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enqueue', leadIds: [leadId] }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      const created = json.data?.created ?? 0
      const skipped = json.data?.skipped ?? []
      if (created > 0) {
        setResult('Adicionado. O email com o problema será enviado pelo fluxo de outreach.')
        toast.success('Lead na fila de envio.')
      } else {
        const reason = skipped[0]?.reason ?? 'verifique e-mail, integridade do lead ou se a campanha está liberada'
        setResult(`Não entrou: ${reason}`)
        toast.error(`Lead não entrou: ${reason}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao adicionar à campanha'
      setResult(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }, [selected, leadId])

  if (hidden || campaigns === null) return null

  return (
    <div className="rounded-lg border p-4" data-testid="add-to-campaign">
      <h4 className="text-sm font-medium">Enviar este lead</h4>
      {campaigns.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Nenhuma campanha pronta para envio.{' '}
          <Link href={Routes.ADMIN_OUTREACH} className="underline">Abrir o Centro de Outreach</Link>{' '}
          para criar e liberar uma campanha.
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              data-testid="add-to-campaign-select"
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
              aria-label="Escolher campanha"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.dryRun ? ' (simulação)' : ''}</option>
              ))}
            </select>
            <Button size="sm" disabled={busy || !selected} onClick={() => void add()} data-testid="add-to-campaign-submit">
              Adicionar à campanha
            </Button>
          </div>
          {result && <p className="mt-2 text-xs" data-testid="add-to-campaign-result">{result}</p>}
        </>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        O email usará o pitch acima (ou um é gerado automaticamente se você não gerar). Envio respeita kill-switch, supressão e janela da caixa.
      </p>
    </div>
  )
}
