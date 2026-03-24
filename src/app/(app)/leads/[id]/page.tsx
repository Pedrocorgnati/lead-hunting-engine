import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Building2, MapPin, Phone, Globe } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLead } from '@/actions/leads'
import { Routes } from '@/lib/constants'
import { LeadDetailInteractive } from '@/components/leads/lead-detail-interactive'
import { BudgetFlow } from '@/components/leads/budget-flow'

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

      {/* Interactive section: status, score, lifecycle, tabs */}
      <LeadDetailInteractive lead={interactiveData} />

      {/* BudgetFlow: integração com ferramenta externa de orçamento (P003/P041) */}
      {/* RESOLVED: BudgetFlow não renderizado */}
      <BudgetFlow leadId={lead.id} leadName={lead.name} />
    </div>
  )
}
