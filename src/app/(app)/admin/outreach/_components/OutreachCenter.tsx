'use client'

/**
 * outreach-engine (brainstorm 06-10, tasks 15/29 + 3o passe de UX/Codex):
 * Centro de Outreach + Painel de Saúde. Centro de OPERAÇÃO, não só métricas.
 *
 * Correções do review de UX (Codex, 3o passe):
 *  - Checklist de prontidão PERSISTENTE (não some só por existir 1 caixa/campanha).
 *  - Linguagem de negócio em vez de jargão de engine ("Liberar envio real",
 *    "Pausar todos os envios", "Verificar prontidão", "Simulação").
 *  - Resultado do "Adicionar leads" é VISÍVEL (X adicionados / Y pulados + motivos).
 *  - Busy por-recurso (uma ação não trava todos os botões).
 *  - Preflight buscado no load (estado explícito, não "vazio = ok").
 *  - Motivo da pausa automática (drift) visível na linha da campanha.
 *  - Preset Hostinger no cadastro de caixa.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'

interface Metrics {
  outreach_send_attempts_total: number
  outreach_send_success_total: number
  outreach_send_ambiguous_total: number
  outreach_bounce_total: number
  outreach_suppressed_total: number
  queue_drain_lag_p95_seconds: number
  reply_sync_lag_p95_seconds: number
  bounce_rate: number
  reply_rate: number
}
interface Funnel {
  campaignId: string
  name: string
  status: string
  scheduled: number
  sent: number
  bounced: number
  replied: number
  interested: number
  failed: number
  ambiguous: number
}
interface Violation { rule: string; severity: 'high' | 'medium'; message: string }
interface HealthState { killSwitch: boolean; dryRun: boolean }
interface Campaign {
  id: string
  name: string
  status: string
  market: string
  niche: string | null
  dryRun: boolean
  approvedAt: string | null
  pauseReason: string | null
  autoEnroll?: { enabled: boolean; dailyCap: number }
}
interface MailboxHealth { healthy: boolean; reasons: string[]; sent24h: number; dailyCapRemaining: number }
interface Mailbox {
  id: string
  label: string
  emailAddress: string
  status: string
  smtpHost: string
  smtpPort: number
  sendWindow: string
  lastError: string | null
  health: MailboxHealth
}
interface Suppression { id: string; kind: string; value: string; reason: string; cooldownUntil: string | null }
interface PreflightItem { id: string; label: string; ok: boolean; evidence: string }
interface PreflightResult { passed: boolean; ranAt: string; items: PreflightItem[]; rejectionCriteria: PreflightItem[] }
interface PreflightStatus { passed: boolean; lastRunAt: string | null }
interface NicheFacet { niche: string | null; total: number; eligible: number }
interface ContactQueueItem {
  leadId: string; businessName: string; niche: string | null; city: string | null
  phoneDisplay: string; e164: string; isMobile: boolean; problems: string[]
  message: string; waLink: string | null; telLink: string | null
}
interface FacetSummary { totalLeads: number; eligibleLeads: number; withEmail: number; minIntegrity: number }
interface EnqueueDiagnostics {
  analyzed: number; analyzedCapped: boolean; noEmail: number; malformedEmail: number
  genericBlocked: number; lowIntegrity: number; suppressed: number; alreadyQueued: number; eligible: number
}

/** Mensagem HONESTA do resultado de "Adicionar leads" (nada de "verifique filtro"). */
function describeEnqueue(created: number, d: EnqueueDiagnostics | undefined): string {
  if (!d) return created > 0 ? `${created} lead(s) na fila de envio` : 'Nenhum lead entrou'
  if (created > 0) {
    const extra = d.eligible > created ? ` · ${d.eligible - created} elegíveis ficaram para o próximo lote` : ''
    return `${created} lead(s) na fila de envio${extra}`
  }
  if (d.analyzed === 0) return 'Nenhum lead neste nicho com status novo/contatado. Escolha outro nicho ou colete leads.'
  const reasons: string[] = []
  if (d.noEmail) reasons.push(`${d.noEmail} sem e-mail`)
  if (d.lowIntegrity) reasons.push(`${d.lowIntegrity} sem score de integridade`)
  if (d.malformedEmail) reasons.push(`${d.malformedEmail} com e-mail inválido`)
  if (d.genericBlocked) reasons.push(`${d.genericBlocked} e-mail genérico bloqueado`)
  if (d.suppressed) reasons.push(`${d.suppressed} suprimidos`)
  if (d.alreadyQueued) reasons.push(`${d.alreadyQueued} já na fila`)
  return `0 de ${d.analyzed} analisados entraram. Motivos: ${reasons.join(', ')}.`
}

const METRIC_LABELS: Array<{ key: keyof Metrics; label: string; fmt?: (v: number) => string }> = [
  { key: 'outreach_send_attempts_total', label: 'Tentativas (24h)' },
  { key: 'outreach_send_success_total', label: 'Enviados (24h)' },
  { key: 'outreach_send_ambiguous_total', label: 'Ambíguos (24h)' },
  { key: 'outreach_bounce_total', label: 'Bounces (24h)' },
  { key: 'outreach_suppressed_total', label: 'Suprimidos (24h)' },
  { key: 'bounce_rate', label: 'Taxa de bounce', fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { key: 'reply_rate', label: 'Taxa de resposta', fmt: (v) => `${(v * 100).toFixed(1)}%` },
  { key: 'queue_drain_lag_p95_seconds', label: 'Lag drenagem (s)' },
  { key: 'reply_sync_lag_p95_seconds', label: 'Lag inbound (s)' },
]

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
  return json.data ?? json
}

export function OutreachCenter() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [alerts, setAlerts] = useState<Violation[]>([])
  const [health, setHealth] = useState<HealthState | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [suppression, setSuppression] = useState<Suppression[]>([])
  const [preflight, setPreflight] = useState<PreflightResult | null>(null)
  const [preflightStatus, setPreflightStatus] = useState<PreflightStatus | null>(null)
  const [facets, setFacets] = useState<NicheFacet[]>([])
  const [facetSummary, setFacetSummary] = useState<FacetSummary | null>(null)
  // Busy por-recurso: a chave da ação em curso (ex.: 'killswitch', 'campaign:abc',
  // 'mailbox:xyz:test'). null = nada em curso. Botões só travam a própria ação.
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [m, h, c, mb, sup, pf, lf] = await Promise.all([
        api('/api/v1/admin/outreach/metrics'),
        api('/api/v1/admin/outreach/kill-switch'),
        api('/api/v1/admin/outreach/campaigns'),
        api('/api/v1/admin/outreach/mailboxes'),
        api('/api/v1/admin/outreach/suppression?limit=50'),
        api('/api/v1/admin/outreach/preflight'),
        api('/api/v1/admin/outreach/lead-facets'),
      ])
      setMetrics(m.metrics); setFunnels(m.funnels ?? []); setAlerts(m.alerts ?? [])
      setHealth(h); setCampaigns(c.campaigns ?? []); setMailboxes(mb.mailboxes ?? [])
      setSuppression(Array.isArray(sup) ? sup : sup.data ?? [])
      setPreflightStatus(pf)
      setFacets(lf.facets ?? []); setFacetSummary(lf.summary ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o painel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Fetch-on-mount + polling de 30s para sincronizar com o backend (estado
    // externo). A regra set-state-in-effect mira cascading renders sincronos;
    // aqui o setState acontece pos-await, dentro de load(). Caso aceito pela
    // propria doc (subscribe-and-setState).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const id = setInterval(() => void load(), 30_000)
    return () => clearInterval(id)
  }, [load])

  // run com chave de recurso + mensagem opcional dinâmica (para mostrar resultado).
  const run = useCallback(async (key: string, fn: () => Promise<string | void>, okMsg?: string) => {
    setBusyKey(key)
    try { const dyn = await fn(); toast.success(typeof dyn === 'string' ? dyn : (okMsg ?? 'Feito')); await load() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Erro') }
    finally { setBusyKey(null) }
  }, [load])

  const toggleKillSwitch = (enabled: boolean) =>
    run('killswitch', async () => {
      const d = await api('/api/v1/admin/outreach/kill-switch', { method: 'PUT', body: JSON.stringify({ enabled, reason: enabled ? 'Reativação manual' : 'Pausa de emergência' }) })
      setHealth(d)
    }, enabled ? 'Envios reativados' : 'Todos os envios pausados')

  const campaignAction = (id: string, action: string, extra?: Record<string, unknown>) =>
    run(`campaign:${id}:${action}`, async () => {
      const r = await api(`/api/v1/admin/outreach/campaigns/${id}/actions`, { method: 'POST', body: JSON.stringify({ action, ...extra }) })
      // Resultado HONESTO do "Adicionar leads" (diagnostics da mesma classificação do enqueue).
      if (action === 'enqueue') {
        return describeEnqueue(r?.created ?? 0, r?.diagnostics as EnqueueDiagnostics | undefined)
      }
      return undefined
    }, `Pronto`)

  // "Liberar envio real" auto-guiado: roda a verificação de prontidão e, se
  // aprovar, arma na mesma ação (1 clique). Sem jargão, sem esconder os 2 passos.
  const armCampaign = (id: string) =>
    run(`campaign:${id}:arm`, async () => {
      const pf = (await api('/api/v1/admin/outreach/preflight', { method: 'POST' })) as PreflightResult
      setPreflight(pf)
      setPreflightStatus({ passed: pf.passed, lastRunAt: pf.ranAt })
      if (!pf.passed) {
        const firstFail = [...pf.items, ...pf.rejectionCriteria].find((i) => !i.ok)
        throw new Error(
          `Verificação de prontidão reprovada${firstFail ? `: ${firstFail.label}` : ''}. Veja os detalhes na aba Operação.`,
        )
      }
      await api(`/api/v1/admin/outreach/campaigns/${id}/actions`, { method: 'POST', body: JSON.stringify({ action: 'arm' }) })
      return 'Verificação de prontidão aprovada. Envio real liberado.'
    })

  const runPreflight = () =>
    run('preflight', async () => {
      const r = (await api('/api/v1/admin/outreach/preflight', { method: 'POST' })) as PreflightResult
      setPreflight(r)
      setPreflightStatus({ passed: r.passed, lastRunAt: r.ranAt })
      return r.passed ? 'Verificação de prontidão aprovada' : 'Verificação reprovada — veja os itens na aba Operação'
    })

  const sendTestToMe = () =>
    run('test-send', async () => {
      const r = await api('/api/v1/admin/outreach/test-send', { method: 'POST', body: JSON.stringify({}) })
      return r?.sent ? `Teste enviado para ${r.to} (caixa ${r.mailbox}). Confira sua caixa de entrada.` : 'O envio de teste não foi aceito pelo servidor SMTP.'
    })

  if (loading) {
    return (
      <div className="space-y-4 p-4" data-testid="outreach-center-loading" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4" data-testid="outreach-center-error">
        <Alert variant="destructive" role="alert">
          <AlertTitle>Não foi possível carregar o Centro de Outreach</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button className="mt-3" onClick={() => void load()}>Tentar novamente</Button>
      </div>
    )
  }

  const activeMailboxes = mailboxes.filter((m) => m.status === 'ACTIVE' && m.health.healthy).length
  // Campanha "pronta para enviar de verdade": ACTIVE + aprovada + envio real (não simulação).
  const liveCampaigns = campaigns.filter((c) => c.status === 'ACTIVE' && c.approvedAt && !c.dryRun).length

  // Checklist de prontidão — PERSISTENTE até o sistema poder enviar de verdade.
  const readiness = [
    { ok: mailboxes.length > 0, label: 'Caixa de envio cadastrada' },
    { ok: activeMailboxes > 0, label: 'Caixa ativa e saudável' },
    { ok: campaigns.length > 0, label: 'Campanha criada' },
    { ok: campaigns.some((c) => c.approvedAt), label: 'Campanha aprovada' },
    { ok: liveCampaigns > 0, label: 'Envio real liberado (fora de simulação)' },
    { ok: !!health?.killSwitch, label: 'Envios habilitados (kill-switch desligado)' },
    { ok: !!preflightStatus?.passed, label: 'Verificação de prontidão aprovada' },
  ]
  const readyToSend = readiness.every((r) => r.ok)

  return (
    <div className="space-y-6 p-4" data-testid="outreach-center">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Centro de Outreach</h1>
          <p className="text-sm text-muted-foreground">Cadastre uma caixa, crie a campanha, libere o envio e adicione leads. Acompanhe a saúde aqui.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={health?.killSwitch ? 'default' : 'destructive'} data-testid="outreach-killswitch-state">
            {health?.killSwitch ? 'Envios ativos' : 'Envios pausados'}
          </Badge>
          {health?.dryRun && <Badge variant="secondary">SIMULAÇÃO</Badge>}
          <Button variant={health?.killSwitch ? 'destructive' : 'default'} disabled={busyKey === 'killswitch'}
            onClick={() => void toggleKillSwitch(!health?.killSwitch)} data-testid="outreach-killswitch-toggle">
            {health?.killSwitch ? 'Pausar todos os envios' : 'Reativar envios'}
          </Button>
          <Button variant="outline" disabled={busyKey === 'test-send' || activeMailboxes === 0}
            onClick={() => void sendTestToMe()} data-testid="outreach-test-send"
            title={activeMailboxes === 0 ? 'Ative uma caixa de envio primeiro' : 'Envia um e-mail real para o seu próprio endereço'}>
            Enviar teste pra mim
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={busyKey !== null}>Atualizar</Button>
        </div>
      </header>

      {/* Verdade do inventário: cold email precisa de e-mail. Se a base não tem,
          nenhuma campanha envia — diga isso na cara, não esconda no funil. */}
      {facetSummary && facetSummary.totalLeads > 0 && facetSummary.eligibleLeads === 0 && (
        <Alert variant="destructive" role="status" data-testid="outreach-audience-dead">
          <AlertTitle>Seus leads não têm e-mail — não há para quem enviar</AlertTitle>
          <AlertDescription>
            <p className="text-sm">
              {facetSummary.totalLeads} leads coletados, {facetSummary.withEmail} com e-mail, <strong>0 elegíveis</strong> para
              cold email (precisa de e-mail + score de integridade ≥ {facetSummary.minIntegrity}).
            </p>
            <p className="mt-1 text-sm">
              Negócio sem site quase nunca tem e-mail público. Para esse público, o canal realista é <strong>WhatsApp/telefone</strong>.
              Você ainda pode validar a mecânica de envio com o botão <strong>&ldquo;Enviar teste pra mim&rdquo;</strong>.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Checklist de prontidão — persiste até poder enviar de verdade */}
      {!readyToSend && (
        <Alert role="status" data-testid="outreach-readiness">
          <AlertTitle>Para enviar emails de verdade, falta:</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-0.5">
              {readiness.map((r) => {
                const isPreflight = r.label === 'Verificação de prontidão aprovada'
                return (
                  <li key={r.label} className="flex items-center gap-2 text-sm">
                    <span className={r.ok ? 'text-emerald-600' : 'text-destructive'} aria-hidden>{r.ok ? '✓' : '○'}</span>
                    <span className={r.ok ? 'text-muted-foreground line-through' : ''}>{r.label}</span>
                    {isPreflight && !r.ok && (
                      <Button size="sm" variant="outline" className="ml-2 h-6 px-2 py-0 text-xs"
                        disabled={busyKey === 'preflight'} onClick={() => void runPreflight()} data-testid="readiness-run-preflight">
                        Verificar agora
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-xs">Comece pela aba {mailboxes.length === 0 ? '"Caixas"' : campaigns.length === 0 ? '"Campanhas"' : '"Operação" (verificação de prontidão)'}.</p>
          </AlertDescription>
        </Alert>
      )}
      {readyToSend && (
        <Alert role="status" data-testid="outreach-ready">
          <AlertTitle>Tudo pronto para enviar.</AlertTitle>
          <AlertDescription>Adicione leads a uma campanha (aqui na aba Campanhas, ou pela lista de leads no botão &ldquo;Adicionar prontos à campanha&rdquo;).</AlertDescription>
        </Alert>
      )}

      {alerts.length > 0 && (
        <section data-testid="outreach-alerts" className="space-y-2">
          {alerts.map((a) => (
            <Alert key={a.rule} variant={a.severity === 'high' ? 'destructive' : 'default'} role="alert">
              <AlertTitle>{a.rule}</AlertTitle>
              <AlertDescription>{a.message}</AlertDescription>
            </Alert>
          ))}
        </section>
      )}

      <Tabs defaultValue="campanhas">
        <TabsList>
          <TabsTrigger value="contato" data-testid="tab-contato">Contato direto</TabsTrigger>
          <TabsTrigger value="campanhas" data-testid="tab-campanhas">Campanhas ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="caixas" data-testid="tab-caixas">Caixas ({mailboxes.length}{activeMailboxes > 0 ? `, ${activeMailboxes} ok` : ''})</TabsTrigger>
          <TabsTrigger value="operacao" data-testid="tab-operacao">Operação</TabsTrigger>
          <TabsTrigger value="saude" data-testid="tab-saude">Saúde</TabsTrigger>
        </TabsList>

        <TabsContent value="contato" className="space-y-4">
          <ContactQueuePanel facets={facets} />
        </TabsContent>

        <TabsContent value="campanhas" className="space-y-4">
          <CampaignsPanel campaigns={campaigns} funnels={funnels} facets={facets} busyKey={busyKey}
            onCreate={(payload) => run('campaign:create', async () => { await api('/api/v1/admin/outreach/campaigns', { method: 'POST', body: JSON.stringify(payload) }) }, 'Campanha criada (em rascunho)')}
            onAction={campaignAction} onArm={armCampaign} />
        </TabsContent>

        <TabsContent value="caixas" className="space-y-4">
          <MailboxesPanel mailboxes={mailboxes} busyKey={busyKey}
            onCreate={(payload) => run('mailbox:create', async () => { await api('/api/v1/admin/outreach/mailboxes', { method: 'POST', body: JSON.stringify(payload) }) }, 'Caixa criada (em pausa — teste e ative)')}
            onPatch={(id, action) => run(`mailbox:${id}:${action}`, async () => {
              const r = await api('/api/v1/admin/outreach/mailboxes', { method: 'PATCH', body: JSON.stringify({ id, action }) })
              if (action === 'test') { if (r.ok) return 'Conexão SMTP OK'; throw new Error(r.reason ?? 'falha no teste') }
              return action === 'activate' ? 'Caixa ativada' : 'Caixa pausada'
            })}
            onDelete={(id) => run(`mailbox:${id}:delete`, async () => { await api(`/api/v1/admin/outreach/mailboxes?id=${id}`, { method: 'DELETE' }) }, 'Caixa removida')} />
        </TabsContent>

        <TabsContent value="operacao" className="space-y-4">
          <PreflightPanel preflight={preflight} status={preflightStatus} busyKey={busyKey} onRun={runPreflight} />
          <SuppressionPanel suppression={suppression} busyKey={busyKey}
            onAdd={(payload) => run('suppression:add', async () => { await api('/api/v1/admin/outreach/suppression', { method: 'POST', body: JSON.stringify(payload) }) }, 'Endereço/domínio suprimido')}
            onRemove={(kind, value) => run(`suppression:${value}`, async () => { await api(`/api/v1/admin/outreach/suppression?kind=${kind}&value=${encodeURIComponent(value)}`, { method: 'DELETE' }) }, 'Supressão removida')} />
        </TabsContent>

        <TabsContent value="saude" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {metrics && METRIC_LABELS.map(({ key, label, fmt }) => (
              <Card key={key} data-testid={`outreach-metric-${key}`}>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{fmt ? fmt(metrics[key]) : metrics[key]}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <FunnelTable funnels={funnels} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function FunnelTable({ funnels }: { funnels: Funnel[] }) {
  if (funnels.length === 0) {
    return <EmptyState title="Nenhuma campanha em andamento" description="Crie e aprove uma campanha na aba Campanhas para ver o funil aqui." />
  }
  return (
    <Card>
      <CardHeader><CardTitle>Funil por campanha</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="outreach-funnels">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Campanha</th><th className="px-3">Status</th><th className="px-3">Agendados</th>
                <th className="px-3">Enviados</th><th className="px-3">Respostas</th><th className="px-3">Interessados</th>
                <th className="px-3">Bounces</th><th className="px-3">Ambíguos</th><th className="px-3">Falhas</th>
              </tr>
            </thead>
            <tbody>
              {funnels.map((f) => (
                <tr key={f.campaignId} className="border-b" data-testid={`outreach-funnel-${f.campaignId}`}>
                  <td className="py-2 pr-3 font-medium">{f.name}</td>
                  <td className="px-3"><Badge variant={f.status === 'ACTIVE' ? 'default' : 'secondary'}>{f.status}</Badge></td>
                  <td className="px-3 tabular-nums">{f.scheduled}</td><td className="px-3 tabular-nums">{f.sent}</td>
                  <td className="px-3 tabular-nums">{f.replied}</td><td className="px-3 tabular-nums">{f.interested}</td>
                  <td className="px-3 tabular-nums">{f.bounced}</td><td className="px-3 tabular-nums">{f.ambiguous}</td>
                  <td className="px-3 tabular-nums">{f.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function CampaignsPanel({ campaigns, funnels, facets, busyKey, onCreate, onAction, onArm }: {
  campaigns: Campaign[]; funnels: Funnel[]; facets: NicheFacet[]; busyKey: string | null
  onCreate: (p: { name: string; niche?: string; market?: string }) => void
  onAction: (id: string, action: string, extra?: Record<string, unknown>) => void
  onArm: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [niche, setNiche] = useState('')
  // Nichos reais dos leads (com contagem de elegíveis) — fim do texto livre que
  // dava mismatch "padaria" vs "padarias".
  const nicheOptions = facets.filter((f) => f.niche !== null) as Array<{ niche: string; total: number; eligible: number }>
  const funnelById = new Map(funnels.map((f) => [f.campaignId, f]))
  const isBusy = (id: string) => busyKey?.startsWith(`campaign:${id}`) ?? false

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Nova campanha</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onCreate({ name: name.trim(), niche: niche.trim() || undefined }); setName(''); setNiche('') } }}>
            <div className="flex-1 min-w-48">
              <Label htmlFor="camp-name">Nome</Label>
              <Input id="camp-name" data-testid="campaign-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Padarias sem site - Campinas" required minLength={3} />
            </div>
            <div className="flex-1 min-w-56">
              <Label htmlFor="camp-niche">Público (nicho dos leads)</Label>
              <select id="camp-niche" data-testid="campaign-niche" value={niche} onChange={(e) => setNiche(e.target.value)}
                className="block h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
                <option value="">Todos os nichos</option>
                {nicheOptions.map((f) => (
                  <option key={f.niche} value={f.niche}>
                    {f.niche} ({f.eligible} elegíveis / {f.total})
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busyKey === 'campaign:create' || name.trim().length < 3} data-testid="campaign-create">Criar campanha</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Nasce em rascunho (não envia). Depois: <strong>Aprovar</strong> (revisar) → <strong>Liberar envio real</strong> (sai da simulação) → <strong>Adicionar leads</strong>.
          </p>
        </CardContent>
      </Card>

      {campaigns.length === 0 ? (
        <EmptyState title="Nenhuma campanha" description="Crie a primeira campanha acima." />
      ) : (
        <Card>
          <CardHeader><CardTitle>Campanhas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {campaigns.map((c) => {
              const f = funnelById.get(c.id)
              const approved = !!c.approvedAt
              const busy = isBusy(c.id)
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" data-testid={`campaign-row-${c.id}`}>
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.market} · {c.niche ?? 'todos os nichos'} · {c.dryRun ? 'simulação' : 'envio real'}
                      {f ? ` · ${f.sent} enviados / ${f.scheduled} agendados` : ''}
                    </div>
                    {c.status === 'PAUSED' && c.pauseReason && (
                      <div className="text-xs text-destructive">pausada: {c.pauseReason}</div>
                    )}
                    {/* Auto-envio: agenda envio automatico de novos leads do grupo */}
                    {c.status === 'ACTIVE' && c.approvedAt && !c.dryRun && (
                      <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground" title="Inscreve novos leads elegíveis do nicho da campanha automaticamente, todo dia, até o limite.">
                        <input
                          type="checkbox"
                          checked={c.autoEnroll?.enabled ?? false}
                          disabled={busy}
                          onChange={(e) => onAction(c.id, 'set-auto-enroll', { enabled: e.target.checked, dailyCap: c.autoEnroll?.dailyCap ?? 25 })}
                          data-testid={`campaign-autoenroll-${c.id}`}
                        />
                        Enviar novos leads automaticamente
                        {c.autoEnroll?.enabled && <span>(até {c.autoEnroll.dailyCap}/dia)</span>}
                      </label>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={c.status === 'ACTIVE' ? 'default' : 'secondary'}>{c.status}</Badge>
                    {c.status === 'DRAFT' && <Button size="sm" disabled={busy} onClick={() => onAction(c.id, 'approve')} data-testid={`campaign-approve-${c.id}`}>Aprovar</Button>}
                    {c.status === 'ACTIVE' && c.dryRun && approved && <Button size="sm" disabled={busy} onClick={() => onArm(c.id)} data-testid={`campaign-arm-${c.id}`}>Liberar envio real</Button>}
                    {c.status === 'ACTIVE' && <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(c.id, 'enqueue', { limit: 50 })} data-testid={`campaign-enqueue-${c.id}`}>Adicionar leads</Button>}
                    {c.status === 'ACTIVE' && <Button size="sm" variant="destructive" disabled={busy} onClick={() => { const reason = window.prompt('Motivo da pausa (mín. 3 chars):'); if (reason && reason.length >= 3) onAction(c.id, 'pause', { reason }) }}>Pausar</Button>}
                    {(c.status === 'ACTIVE' || c.status === 'PAUSED') && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (window.confirm(`Cancelar a campanha "${c.name}" e todos os envios futuros? O histórico é preservado.`)) onAction(c.id, 'rollback', { reason: 'Cancelada pelo operador' }) }} data-testid={`campaign-rollback-${c.id}`}>Cancelar</Button>}
                    {c.status === 'PAUSED' && <Button size="sm" disabled={busy} onClick={() => onAction(c.id, 'resume')}>Retomar</Button>}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function PreflightPanel({ preflight, status, busyKey, onRun }: { preflight: PreflightResult | null; status: PreflightStatus | null; busyKey: string | null; onRun: () => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Verificação de prontidão (pré-produção)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busyKey === 'preflight'} onClick={onRun} data-testid="preflight-run">Verificar prontidão</Button>
          {preflight ? (
            <Badge variant={preflight.passed ? 'default' : 'destructive'} data-testid="preflight-result">
              {preflight.passed ? 'APROVADO — pode liberar envio real' : 'REPROVADO — corrija os itens abaixo'}
            </Badge>
          ) : status?.lastRunAt ? (
            <Badge variant={status.passed ? 'default' : 'destructive'}>
              Última verificação: {status.passed ? 'aprovada' : 'reprovada'} ({new Date(status.lastRunAt).toLocaleString('pt-BR')})
            </Badge>
          ) : (
            <Badge variant="secondary">Nunca verificado</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Confere idempotência, kill-switch seguro, mascaramento de respostas, rollback e supressão, além de bounce, eventos de contato e fila. Uma campanha só pode liberar envio real com esta verificação aprovada.
        </p>
        {preflight && (
          <div className="space-y-1">
            {[...preflight.items, ...preflight.rejectionCriteria].map((it) => (
              <div key={it.id} className="flex items-start gap-2 text-sm" data-testid={`preflight-item-${it.id}`}>
                <span className={it.ok ? 'text-emerald-600' : 'text-destructive'} aria-hidden>{it.ok ? '✓' : '✗'}</span>
                <span><strong>{it.label}</strong> — <span className="text-muted-foreground">{it.evidence}</span></span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SuppressionPanel({ suppression, busyKey, onAdd, onRemove }: {
  suppression: Suppression[]; busyKey: string | null
  onAdd: (p: { kind: string; value: string; reason: string }) => void
  onRemove: (kind: string, value: string) => void
}) {
  const [value, setValue] = useState('')
  const [kind, setKind] = useState('EMAIL')
  const [reason, setReason] = useState('MANUAL')
  return (
    <Card>
      <CardHeader><CardTitle>Não enviar (supressão)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (value.trim()) { onAdd({ kind, value: value.trim(), reason }); setValue('') } }}>
          <div>
            <Label>Tipo</Label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="block h-9 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="EMAIL">E-mail</option><option value="DOMAIN">Domínio</option>
            </select>
          </div>
          <div className="flex-1 min-w-48">
            <Label htmlFor="sup-value">{kind === 'EMAIL' ? 'E-mail' : 'Domínio'}</Label>
            <Input id="sup-value" data-testid="suppression-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === 'EMAIL' ? 'naoenviar@empresa.com' : 'empresa.com'} />
          </div>
          <div>
            <Label>Motivo</Label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="block h-9 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="MANUAL">Manual</option><option value="UNSUBSCRIBED">Opt-out</option>
              <option value="BOUNCED">Bounce</option><option value="COMPLAINT">Reclamação</option>
            </select>
          </div>
          <Button type="submit" disabled={busyKey === 'suppression:add' || !value.trim()} data-testid="suppression-add">Suprimir</Button>
        </form>
        {suppression.length === 0 ? (
          <EmptyState title="Lista de supressão vazia" description="Endereços/domínios suprimidos nunca recebem envio." />
        ) : (
          <div className="space-y-1" data-testid="suppression-list">
            {suppression.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span>
                  <Badge variant="secondary" className="mr-2">{s.kind}</Badge>{s.value}
                  <span className="ml-2 text-xs text-muted-foreground">{s.reason}{s.cooldownUntil ? ` · até ${new Date(s.cooldownUntil).toLocaleDateString('pt-BR')}` : ' · permanente'}</span>
                </span>
                <Button size="sm" variant="ghost" disabled={busyKey === `suppression:${s.value}`} onClick={() => onRemove(s.kind, s.value)}>Remover</Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const OUTCOME_BUTTONS: Array<{ outcome: string; label: string; variant?: 'default' | 'outline' | 'destructive' | 'secondary' }> = [
  { outcome: 'SENT', label: 'Enviei / Falei', variant: 'default' },
  { outcome: 'INTERESTED', label: 'Interessado', variant: 'default' },
  { outcome: 'SCHEDULED', label: 'Agendou', variant: 'default' },
  { outcome: 'NO_ANSWER', label: 'Não atendeu', variant: 'outline' },
  { outcome: 'REJECTED', label: 'Sem interesse', variant: 'secondary' },
  { outcome: 'BOUNCED', label: 'Número errado', variant: 'secondary' },
  { outcome: 'OPT_OUT', label: 'Não perturbe', variant: 'destructive' },
]

function ContactQueuePanel({ facets }: { facets: NicheFacet[] }) {
  const [niche, setNiche] = useState('')
  const [items, setItems] = useState<ContactQueueItem[]>([])
  const [summary, setSummary] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyLead, setBusyLead] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const nicheOptions = facets.filter((f) => f.niche !== null) as Array<{ niche: string; total: number; eligible: number }>

  const load = useCallback(async (n: string) => {
    setLoading(true)
    try {
      const r = await api(`/api/v1/admin/outreach/contact-queue?limit=50${n ? `&niche=${encodeURIComponent(n)}` : ''}`)
      setItems(r.items ?? [])
      setSummary(r.summary ?? null)
      setDrafts(Object.fromEntries((r.items ?? []).map((it: ContactQueueItem) => [it.leadId, it.message])))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar a fila')
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(niche) }, [load, niche])

  const logOutcome = async (item: ContactQueueItem, outcome: string) => {
    setBusyLead(item.leadId)
    try {
      await api('/api/v1/admin/outreach/contact-outcome', {
        method: 'POST',
        body: JSON.stringify({ leadId: item.leadId, channel: item.isMobile ? 'WHATSAPP' : 'TELEFONE', outcome }),
      })
      setItems((prev) => prev.filter((i) => i.leadId !== item.leadId))
      toast.success('Desfecho registrado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao registrar desfecho')
    } finally {
      setBusyLead(null)
    }
  }

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('Mensagem copiada') }
    catch { toast.error('Não foi possível copiar') }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-56">
            <Label htmlFor="contact-niche">Público (nicho)</Label>
            <select id="contact-niche" data-testid="contact-niche" value={niche} onChange={(e) => setNiche(e.target.value)}
              className="block h-9 w-full rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">Todos os nichos</option>
              {nicheOptions.map((f) => <option key={f.niche} value={f.niche}>{f.niche}</option>)}
            </select>
          </div>
          <Button variant="outline" onClick={() => void load(niche)} disabled={loading}>Atualizar fila</Button>
          {summary && (
            <p className="text-xs text-muted-foreground">
              {summary.shown} na fila · {summary.mobile} com WhatsApp · {summary.landline} só telefone
              {summary.suppressed ? ` · ${summary.suppressed} suprimidos` : ''}
              {summary.alreadyContacted ? ` · ${summary.alreadyContacted} já contatados` : ''}
            </p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum lead com telefone nesta fila"
          description="Negócio sem site quase nunca tem telefone móvel no Google. Colete mais leads ou rode o backfill de telefone (scripts/enrich-place-details.ts). Telefone fixo aparece aqui só com o botão Ligar." />
      ) : (
        <div className="space-y-3" data-testid="contact-queue">
          {items.map((item) => {
            const msg = drafts[item.leadId] ?? item.message
            const waLink = item.isMobile ? `https://wa.me/${item.e164}?text=${encodeURIComponent(msg)}` : null
            const busy = busyLead === item.leadId
            return (
              <Card key={item.leadId} data-testid={`contact-row-${item.leadId}`}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{item.businessName}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.phoneDisplay} · {item.isMobile ? 'celular' : 'fixo'}
                        {item.niche ? ` · ${item.niche}` : ''}{item.city ? ` · ${item.city}` : ''}
                      </div>
                      {item.problems.length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">Problema: {item.problems.slice(0, 2).join('; ')}</div>
                      )}
                    </div>
                    <Badge variant={item.isMobile ? 'default' : 'secondary'}>{item.isMobile ? 'WhatsApp' : 'Só ligação'}</Badge>
                  </div>

                  <textarea
                    value={msg}
                    onChange={(e) => setDrafts((d) => ({ ...d, [item.leadId]: e.target.value }))}
                    className="block w-full rounded-lg border border-border bg-background p-2 text-sm"
                    rows={3}
                    data-testid={`contact-msg-${item.leadId}`}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    {waLink && (
                      <a href={waLink} target="_blank" rel="noreferrer">
                        <Button size="sm" disabled={busy} data-testid={`contact-wa-${item.leadId}`}>Abrir WhatsApp</Button>
                      </a>
                    )}
                    {item.telLink && (
                      <a href={item.telLink}><Button size="sm" variant="outline" disabled={busy}>Ligar</Button></a>
                    )}
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void copy(msg)}>Copiar mensagem</Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                    <span className="text-xs text-muted-foreground">Desfecho:</span>
                    {OUTCOME_BUTTONS.map((o) => (
                      <Button key={o.outcome} size="sm" variant={o.variant ?? 'outline'} disabled={busy}
                        onClick={() => void logOutcome(item, o.outcome)} data-testid={`contact-outcome-${item.leadId}-${o.outcome}`}>
                        {o.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

const MAILBOX_PRESETS: Record<string, { smtpHost: string; smtpPort: string; imapHost: string }> = {
  hostinger: { smtpHost: 'smtp.hostinger.com', smtpPort: '465', imapHost: 'imap.hostinger.com' },
  gmail: { smtpHost: 'smtp.gmail.com', smtpPort: '465', imapHost: 'imap.gmail.com' },
}

function MailboxesPanel({ mailboxes, busyKey, onCreate, onPatch, onDelete }: {
  mailboxes: Mailbox[]; busyKey: string | null
  onCreate: (p: Record<string, unknown>) => void
  onPatch: (id: string, action: 'activate' | 'pause' | 'test') => void
  onDelete: (id: string) => void
}) {
  const [form, setForm] = useState({ label: '', emailAddress: '', password: '', smtpHost: '', smtpPort: '465', imapHost: '' })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const applyPreset = (p: string) => setForm((f) => ({ ...f, ...MAILBOX_PRESETS[p] }))
  const valid = form.label.length >= 2 && /@/.test(form.emailAddress) && form.password.length > 0 && form.smtpHost.length >= 3

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Nova caixa de envio (SMTP)</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Preencher rápido:</span>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('hostinger')} data-testid="mailbox-preset-hostinger">Hostinger</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('gmail')}>Gmail</Button>
          </div>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            onCreate({ label: form.label, emailAddress: form.emailAddress, password: form.password, smtpHost: form.smtpHost, smtpPort: Number(form.smtpPort) || 465, imapHost: form.imapHost || undefined })
            setForm({ label: '', emailAddress: '', password: '', smtpHost: '', smtpPort: '465', imapHost: '' })
          }}>
            <div><Label>Rótulo</Label><Input data-testid="mailbox-label" value={form.label} onChange={set('label')} placeholder="Vendas Corgnati" /></div>
            <div><Label>E-mail (remetente)</Label><Input data-testid="mailbox-email" value={form.emailAddress} onChange={set('emailAddress')} placeholder="vendas@corgnati.com" /></div>
            <div><Label>Senha do e-mail</Label><Input type="password" data-testid="mailbox-password" value={form.password} onChange={set('password')} placeholder="••••••••" /></div>
            <div><Label>Servidor de envio (SMTP)</Label><Input value={form.smtpHost} onChange={set('smtpHost')} placeholder="smtp.hostinger.com" /></div>
            <div><Label>Porta</Label><Input value={form.smtpPort} onChange={set('smtpPort')} placeholder="465" /></div>
            <div><Label>Servidor de respostas (IMAP, opcional)</Label><Input value={form.imapHost} onChange={set('imapHost')} placeholder="imap.hostinger.com" /></div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={busyKey === 'mailbox:create' || !valid} data-testid="mailbox-create">Cadastrar caixa</Button>
              <span className="ml-2 text-xs text-muted-foreground">Porta 465 (SSL) é o padrão Hostinger. A senha é cifrada e nunca exibida. A caixa nasce pausada — teste e ative.</span>
            </div>
          </form>
        </CardContent>
      </Card>

      {mailboxes.length === 0 ? (
        <EmptyState title="Nenhuma caixa cadastrada" description="Sem uma caixa SMTP ativa e saudável, nenhum email é enviado. Cadastre a primeira acima." />
      ) : (
        <Card>
          <CardHeader><CardTitle>Caixas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {mailboxes.map((m) => {
              const busy = busyKey?.startsWith(`mailbox:${m.id}`) ?? false
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" data-testid={`mailbox-row-${m.id}`}>
                  <div>
                    <div className="font-medium">{m.label} <span className="text-xs text-muted-foreground">&lt;{m.emailAddress}&gt;</span></div>
                    <div className="text-xs text-muted-foreground">{m.smtpHost}:{m.smtpPort} · janela {m.sendWindow} · enviados 24h: {m.health.sent24h} · cap restante: {m.health.dailyCapRemaining}</div>
                    {m.lastError && <div className="text-xs text-destructive">erro: {m.lastError}</div>}
                    {!m.health.healthy && m.health.reasons.length > 0 && <div className="text-xs text-destructive">{m.health.reasons.join('; ')}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m.status === 'ACTIVE' ? (m.health.healthy ? 'default' : 'destructive') : 'secondary'}>
                      {m.status === 'ACTIVE' ? (m.health.healthy ? 'Ativa · saudável' : 'Ativa · problema') : m.status}
                    </Badge>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => onPatch(m.id, 'test')} data-testid={`mailbox-test-${m.id}`}>Testar</Button>
                    {m.status !== 'ACTIVE'
                      ? <Button size="sm" disabled={busy} onClick={() => onPatch(m.id, 'activate')} data-testid={`mailbox-activate-${m.id}`}>Ativar</Button>
                      : <Button size="sm" variant="secondary" disabled={busy} onClick={() => onPatch(m.id, 'pause')}>Pausar</Button>}
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`Remover a caixa ${m.label}?`)) onDelete(m.id) }}>Remover</Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
