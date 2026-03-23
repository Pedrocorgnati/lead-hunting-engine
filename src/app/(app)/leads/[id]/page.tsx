import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Building2, MapPin, Phone, Globe } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getLead } from '@/actions/leads'
import { Routes } from '@/lib/constants/routes'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = { title: 'Detalhe do Lead' }

interface LeadDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params
  const lead = await getLead(id)

  if (!lead) {
    notFound()
  }

  const scoreBreakdown = [
    { label: 'Presença Web', score: 0 },
    { label: 'Presença Social', score: 0 },
    { label: 'Avaliações', score: 0 },
    { label: 'Localização', score: 0 },
    { label: 'Maturidade Digital', score: 0 },
    { label: 'Gap Digital', score: 0 },
  ]

  return (
    <div data-testid="lead-detail-page" className="max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <Link
        href={Routes.LEADS}
        data-testid="lead-detail-back-button"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden={true} />
        Voltar para Leads
      </Link>

      {/* Lead header */}
      <div data-testid="lead-detail-header" className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{lead.name}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Building2 className="h-4 w-4" aria-hidden={true} />
              Negócio local
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" aria-hidden={true} />
              {lead.city}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="h-4 w-4" aria-hidden={true} />
              —
            </span>
            <span className="flex items-center gap-1">
              <Globe className="h-4 w-4" aria-hidden={true} />
              —
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs border border-border rounded px-2 py-1">Tipo {lead.type}</span>
          <select
            data-testid="lead-detail-status-select"
            className="h-9 px-3 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary"
            defaultValue={lead.status}
            aria-label="Status do lead"
          >
            <option value="NEW">Novo</option>
            <option value="CONTACTED">Contatado</option>
            <option value="QUALIFIED">Qualificado</option>
            <option value="DISQUALIFIED">Desqualificado</option>
            <option value="CONVERTED">Convertido</option>
          </select>
        </div>
      </div>

      {/* Score card */}
      <div data-testid="lead-detail-score-card" className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Score de Oportunidade</h2>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">{lead.score}</span>
            <span className="text-muted-foreground text-sm">/100</span>
            <span className="text-xs border border-border rounded px-1.5 py-0.5">{lead.type}</span>
          </div>
        </div>

        <div className="space-y-3">
          {scoreBreakdown.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-mono text-foreground">{item.score}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${item.score}%` }}
                  role="progressbar"
                  aria-valuenow={item.score}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={item.label}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs data-testid="lead-detail-tabs" defaultValue="detalhes">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
          <TabsTrigger value="provenance">Provenance</TabsTrigger>
          <TabsTrigger value="pitch">Pitch</TabsTrigger>
        </TabsList>

        <TabsContent value="detalhes" className="space-y-4 mt-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Notas internas</h3>
            <textarea
              data-testid="lead-detail-notes-textarea"
              placeholder="Adicione observações sobre este lead..."
              maxLength={2000}
              className="w-full min-h-[100px] px-3 py-2 text-sm bg-background text-foreground border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary resize-vertical placeholder:text-muted-foreground"
              aria-label="Notas internas sobre o lead"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground">0/2000</span>
              <button
                data-testid="lead-detail-notes-save-button"
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                disabled
              >
                Salvar notas
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Score</p>
              <p className="font-mono font-medium">{lead.score}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Status</p>
              <p className="font-medium">{lead.status}</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="provenance" className="mt-4">
          <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground text-center">
            Dados de provenance serão exibidos após a coleta ser processada.
          </div>
        </TabsContent>

        <TabsContent value="pitch" className="mt-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Pitch personalizado</h3>
              <button
                data-testid="lead-detail-pitch-generate-button"
                disabled
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-md disabled:opacity-50"
              >
                Gerar pitch
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              O pitch será gerado automaticamente após configurar as credenciais de LLM.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
