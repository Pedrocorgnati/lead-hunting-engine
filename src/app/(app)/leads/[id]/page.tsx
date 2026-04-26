import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Building2, MapPin, Phone, Globe } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLead } from '@/actions/leads'
import { Routes } from '@/lib/constants'
import { LeadDetailInteractive } from '@/components/leads/lead-detail-interactive'
import { BudgetFlow } from '@/components/leads/budget-flow'
import { CompetitorsPanel } from '@/components/leads/competitors-panel'
import { LeadSignals } from '@/components/leads/lead-signals'
import { SignalsList } from '@/components/leads/signals-list'
import { LeadHistoryTimeline } from '@/components/leads/LeadHistoryTimeline'
import { PipelineTimeline } from '@/components/leads/PipelineTimeline'
import { LeadTagsEditor } from '@/components/leads/LeadTagsEditor'
import { ContactEventForm } from '@/components/leads/ContactEventForm'
import { BudgetFlowExport } from './_components/BudgetFlowExport'

export const metadata: Metadata = { title: 'Detalhe do Lead' }

interface LeadDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params
  const lead = await getLead(id)

  if (!lead) notFound()

  // Serializar datas para strings antes de passar ao Client Component
  const interactiveData = {
    id: lead.id,
    status: lead.status,
    notes: lead.notes ?? '',
    score: lead.score,
    scoreBreakdown: (lead.scoreBreakdown as Record<string, { score?: number; maxScore?: number }>) ?? {},
    provenance: lead.provenance.map((p) => ({
      id: p.id,
      field: p.field,
      source: p.source,
      sourceUrl: p.sourceUrl,
      collectedAt: p.collectedAt instanceof Date ? p.collectedAt.toISOString() : String(p.collectedAt),
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
    })),
    pitchContent: lead.pitchContent,
    pitchTone: lead.pitchTone,
    createdAt: lead.createdAt instanceof Date ? lead.createdAt.toISOString() : String(lead.createdAt),
    contactedAt: lead.contactedAt instanceof Date ? lead.contactedAt.toISOString() : (lead.contactedAt ? String(lead.contactedAt) : null),
    opportunities: lead.opportunities,
  }

  return (
    <div data-testid="lead-detail-page" className="max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <Link
        href={Routes.LEADS}
        data-testid="lead-detail-back-button"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para Leads
      </Link>

      {/* Static header (name, location, contacts) */}
      <div data-testid="lead-detail-header" className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{lead.name}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
            {lead.category && (
              <span className="flex items-center gap-1">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                {lead.category}
              </span>
            )}
            {lead.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {lead.city}{lead.state ? `, ${lead.state}` : ''}
              </span>
            )}
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="flex items-center gap-1 hover:text-foreground transition-colors min-h-[44px] py-1"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {lead.phone}
              </a>
            )}
            {lead.website && (
              <a
                href={lead.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground transition-colors min-h-[44px] py-1"
              >
                <Globe className="h-4 w-4" aria-hidden="true" />
                Site
              </a>
            )}
          </div>
        </div>
      </div>

      {/* TASK-3 intake-review: badges de sinais estruturados (WhatsApp / E-commerce / Pixels) */}
      <LeadSignals
        isWhatsappChannel={lead.isWhatsappChannel}
        hasEcommerce={lead.hasEcommerce}
        ecommercePlatform={lead.ecommercePlatform}
        analyticsPixels={lead.analyticsPixels}
      />

      {/* TASK-4 intake-review: sinais de oportunidade granulares */}
      {lead.signals.length > 0 && (
        <section data-testid="lead-opportunity-signals" className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Sinais de oportunidade</h2>
          <SignalsList signals={lead.signals} />
        </section>
      )}

      {/* Interactive section: status, score, lifecycle, tabs */}
      <LeadDetailInteractive lead={interactiveData} />

      {/* BudgetFlow: integração com ferramenta externa de orçamento (P003/P041) */}
      {/* RESOLVED: BudgetFlow não renderizado */}
      <BudgetFlow leadId={lead.id} leadName={lead.name} />

      {/* TASK-11 intake-review: exportacao canonica para BudgetFlow (CL-123/124/214) */}
      <BudgetFlowExport leadId={lead.id} leadName={lead.name} />

      {/* TASK-5 intake-review: comparativo com concorrentes (CL-080) */}
      <CompetitorsPanel leadId={lead.id} />

      {/* TASK-25/ST001 intake-review (CL-489): timeline de alteracoes do lead */}
      <LeadHistoryTimeline leadId={lead.id} />

      {/* TASK-16/ST002 intake-review (CL-488): timeline do pipeline com custos */}
      <PipelineTimeline leadId={lead.id} />

      {/* TASK-16/ST003 intake-review (CL-490): tags customizadas do operador */}
      <LeadTagsEditor leadId={lead.id} />

      {/* R-03 intake-review (CL-283 + TASK-18/ST005): contato estruturado canal+resultado */}
      <ContactEventForm leadId={lead.id} />
    </div>
  )
}
