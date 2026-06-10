'use client'

import { useState, Suspense, Component, type ReactNode } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Loader2 } from 'lucide-react'
import { ScoreBreakdown } from './score-breakdown'
import { ProvenanceTable, type ProvenanceRow } from './provenance-table'
import { LeadStatusSelect } from './lead-status-select'
import { LeadNotesEditor } from './lead-notes-editor'
import { LifecycleTracker } from './lifecycle-tracker'
import { PitchCard } from './pitch-card'
import { LeadHistoryTimeline } from './LeadHistoryTimeline'
import { LeadTasksPanel } from './lead-tasks-panel'
import { LeadTagsEditor } from './LeadTagsEditor'
import { CompetitorsPanel } from './competitors-panel'
import { BudgetFlow } from './budget-flow'
import { LeadRadarTab } from './lead-radar-tab'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils/format'
import { OPPORTUNITY_TYPE_MAP, LEAD_STATUS_MAP, type LeadStatus } from '@/lib/constants/enums'

export interface LeadInteractiveData {
  id: string
  name: string
  status: string
  notes: string
  score: number
  scoreBreakdown: Record<string, { score?: number; maxScore?: number }>
  provenance: ProvenanceRow[]
  pitchContent: string | null
  pitchTone: string | null
  createdAt: string
  contactedAt: string | null
  opportunities: string[]
  budgetFlowUrl?: string
}

type Tab = 'overview' | 'pitch' | 'historico' | 'notas' | 'radar'

const VALID_TABS = new Set<Tab>(['overview', 'pitch', 'historico', 'notas', 'radar'])

function resolveTab(raw: string | null): Tab {
  if (raw && VALID_TABS.has(raw as Tab)) return raw as Tab
  return 'overview'
}

interface Props {
  lead: LeadInteractiveData
}

function TabSkeleton() {
  return (
    <div className="flex justify-center py-10" aria-busy="true" aria-label="Carregando aba">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>
  )
}

function TabError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {message}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs underline text-destructive hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        Tentar novamente
      </button>
    </div>
  )
}

/**
 * Item 034: cabea o TabError — erro de render em qualquer aba cai aqui e o
 * "Tentar novamente" remonta o conteudo (resetKey). Trocar de aba tambem
 * reseta (key=activeTab no uso).
 */
class TabErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; resetKey: number }
> {
  state = { hasError: false, resetKey: 0 }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <TabError
          message="Esta aba encontrou um erro ao carregar."
          onRetry={() => this.setState((s) => ({ hasError: false, resetKey: s.resetKey + 1 }))}
        />
      )
    }
    return <div key={this.state.resetKey}>{this.props.children}</div>
  }
}

function LeadNotFoundState() {
  return (
    <div
      role="status"
      data-testid="lead-not-found"
      className="rounded-lg border border-dashed p-12 text-center space-y-3"
    >
      <p className="text-lg font-medium text-foreground">Lead não encontrado</p>
      <p className="text-sm text-muted-foreground">
        Este lead pode ter sido removido ou o endereço é inválido.
      </p>
      <Link
        href="/leads"
        className="inline-block text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        ← Voltar para a lista de leads
      </Link>
    </div>
  )
}

function LeadDetailSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Carregando ficha do lead">
      <div className="h-10 rounded-md bg-muted w-32" />
      <div className="h-24 rounded-md bg-muted" />
      <div className="h-10 rounded-md bg-muted" />
    </div>
  )
}

function LeadDetailInteractiveInner({ lead }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [currentStatus, setCurrentStatus] = useState(lead.status)

  if (!lead.id) return <LeadNotFoundState />

  const activeTab = resolveTab(searchParams.get('tab'))

  const setTab = (tab: Tab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const initialPitch =
    lead.pitchContent && lead.pitchTone
      ? { content: lead.pitchContent, tone: lead.pitchTone }
      : undefined

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Visão geral' },
    { key: 'pitch', label: 'Pitch' },
    { key: 'historico', label: 'Histórico' },
    { key: 'notas', label: 'Notas' },
    { key: 'radar', label: 'Radar' },
  ]

  return (
    <div className="space-y-6">
      {/* Status inline com badge de oportunidade */}
      <div className="flex items-center gap-2 flex-wrap">
        {lead.opportunities.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {OPPORTUNITY_TYPE_MAP[lead.opportunities[0] as keyof typeof OPPORTUNITY_TYPE_MAP]?.label ??
              `Tipo ${lead.opportunities[0].charAt(0)}`}
          </Badge>
        )}
        <LeadStatusSelect
          leadId={lead.id}
          currentStatus={currentStatus}
          onStatusChange={setCurrentStatus}
        />
      </div>

      {/* Score breakdown — exibido apenas quando score > 0 */}
      {lead.score > 0 && (
        <ScoreBreakdown
          totalScore={lead.score}
          opportunities={lead.opportunities}
          breakdown={lead.scoreBreakdown}
        />
      )}

      {/* Lifecycle tracker */}
      <LifecycleTracker
        leadId={lead.id}
        currentStatus={currentStatus}
        onStatusChange={setCurrentStatus}
      />

      {/* Abas: overview | pitch | historico | notas | radar */}
      <div>
        <div
          className="flex gap-1 border-b overflow-x-auto"
          role="tablist"
          aria-label="Seções do lead"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`tabpanel-${tab.key}`}
              id={`tab-${tab.key}`}
              onClick={() => setTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          className="pt-4"
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          data-testid={`tabpanel-${activeTab}`}
        >
          <TabErrorBoundary key={activeTab}>
          {/* ── OVERVIEW ──────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Dados básicos do lead */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Score</p>
                  <p className="font-mono font-bold">{lead.score}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium">
                    {LEAD_STATUS_MAP[currentStatus as LeadStatus]?.label ?? currentStatus}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Criado em</p>
                  <p>{formatDate(lead.createdAt)}</p>
                </div>
                {lead.contactedAt && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Contatado em</p>
                    <p>{formatDate(lead.contactedAt)}</p>
                  </div>
                )}
              </div>

              {/* Procedência campo a campo */}
              <section aria-labelledby="provenance-heading">
                <h3 id="provenance-heading" className="text-sm font-semibold mb-2">
                  Procedência
                </h3>
                {lead.provenance.length > 0 ? (
                  <ProvenanceTable entries={lead.provenance} />
                ) : (
                  <div
                    role="status"
                    className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
                  >
                    Nenhum histórico de procedência registrado.
                  </div>
                )}
              </section>

              {/* Tags */}
              <LeadTagsEditor leadId={lead.id} />

              {/* Concorrentes */}
              <CompetitorsPanel leadId={lead.id} />

              {/* CTA BudgetFlow */}
              <BudgetFlow
                leadId={lead.id}
                leadName={lead.name}
                budgetFlowUrl={lead.budgetFlowUrl}
              />
            </div>
          )}

          {/* ── PITCH ─────────────────────────────────────────────────── */}
          {activeTab === 'pitch' && (
            <PitchCard leadId={lead.id} initialPitch={initialPitch} />
          )}

          {/* ── HISTÓRICO ─────────────────────────────────────────────── */}
          {activeTab === 'historico' && (
            <Suspense fallback={<TabSkeleton />}>
              <LeadHistoryTimeline leadId={lead.id} />
            </Suspense>
          )}

          {/* ── NOTAS ─────────────────────────────────────────────────── */}
          {activeTab === 'notas' && (
            <div className="space-y-4">
              <LeadNotesEditor leadId={lead.id} initialNotes={lead.notes} />
              <LeadTasksPanel leadId={lead.id} />
            </div>
          )}

          {/* ── RADAR ─────────────────────────────────────────────────── */}
          {activeTab === 'radar' && (
            <LeadRadarTab leadId={lead.id} />
          )}
          </TabErrorBoundary>
        </div>
      </div>
    </div>
  )
}

export function LeadDetailInteractive({ lead }: Props) {
  return (
    <Suspense fallback={<LeadDetailSkeleton />}>
      <LeadDetailInteractiveInner lead={lead} />
    </Suspense>
  )
}

export { TabError, LeadNotFoundState }
