'use client'
import { useState } from 'react'
import { ScoreBreakdown } from './score-breakdown'
import { ProvenanceTable, type ProvenanceRow } from './provenance-table'
import { LeadStatusSelect } from './lead-status-select'
import { LeadNotesEditor } from './lead-notes-editor'
import { LifecycleTracker } from './lifecycle-tracker'
import { PitchCard } from './pitch-card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils/format'
import { OPPORTUNITY_TYPE_MAP, LEAD_STATUS_MAP, type LeadStatus } from '@/lib/constants/enums'

export interface LeadInteractiveData {
  id: string
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
}

type Tab = 'details' | 'provenance' | 'pitch'

interface Props {
  lead: LeadInteractiveData
}

export function LeadDetailInteractive({ lead }: Props) {
  const [currentStatus, setCurrentStatus] = useState(lead.status)
  const [activeTab, setActiveTab] = useState<Tab>('details')

  const initialPitch =
    lead.pitchContent && lead.pitchTone
      ? { content: lead.pitchContent, tone: lead.pitchTone }
      : undefined

  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Detalhes' },
    { key: 'provenance', label: 'Procedência' },
    { key: 'pitch', label: 'Pitch' },
  ]

  return (
    <div className="space-y-6">
      {/* Status select — shown inline with header */}
      <div className="flex items-center gap-2 flex-wrap">
        {lead.opportunities.length > 0 && (
          <Badge variant="outline" className="text-xs">
            {OPPORTUNITY_TYPE_MAP[lead.opportunities[0] as keyof typeof OPPORTUNITY_TYPE_MAP]?.label ?? `Tipo ${lead.opportunities[0].charAt(0)}`}
          </Badge>
        )}
        <LeadStatusSelect
          leadId={lead.id}
          currentStatus={currentStatus}
          onStatusChange={setCurrentStatus}
        />
      </div>

      {/* Score breakdown — only if score exists */}
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

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b overflow-x-auto" role="tablist" aria-label="Seções do lead">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`tabpanel-${tab.key}`}
              id={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap min-h-[44px] ${
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
        >
          {activeTab === 'details' && (
            <div className="space-y-4">
              <LeadNotesEditor leadId={lead.id} initialNotes={lead.notes} />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Score</p>
                  <p className="font-mono font-bold">{lead.score}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium">{LEAD_STATUS_MAP[currentStatus as LeadStatus]?.label ?? currentStatus}</p>
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
            </div>
          )}

          {activeTab === 'provenance' && (
            <ProvenanceTable entries={lead.provenance} />
          )}

          {activeTab === 'pitch' && (
            <PitchCard leadId={lead.id} initialPitch={initialPitch} />
          )}
        </div>
      </div>
    </div>
  )
}
