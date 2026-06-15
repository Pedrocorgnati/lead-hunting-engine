import Link from 'next/link'
import { Users, Phone, MessageCircle, Mail } from 'lucide-react'
import { Routes } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { LEAD_STATUS_MAP, OPPORTUNITY_TYPE_MAP } from '@/lib/constants/enums'
import { formatDate } from '@/lib/utils/format'
import { classifyPhone, buildWaMeLink, formatPhoneDisplay } from '@/lib/outreach/phone-utils'
import type { LeadSummary } from '@/actions/leads'

interface LeadsTableProps {
  leads: LeadSummary[]
}

const getStatusLabel = (status: string) =>
  LEAD_STATUS_MAP[status as keyof typeof LEAD_STATUS_MAP]?.label ?? status
const getStatusVariant = (status: string) =>
  LEAD_STATUS_MAP[status as keyof typeof LEAD_STATUS_MAP]?.variant ?? 'secondary'
const getTypeLabel = (opportunities: string[]) => {
  const first = opportunities?.[0]
  if (!first) return '–'
  return OPPORTUNITY_TYPE_MAP[first as keyof typeof OPPORTUNITY_TYPE_MAP]?.label ?? first
}

/**
 * Célula de CONTATO compacta — uma coluna em vez de três colunas de ausência
 * (telefone/whatsapp/email separados viravam um cemitério de "—"; ver review
 * adversarial 06-11). Mostra só o que existe; "Sem contato" quando não há nada.
 */
function ContactCell({ phone, email }: { phone: string | null; email: string | null }) {
  const { e164, isMobile } = classifyPhone(phone)
  const waLink = isMobile ? buildWaMeLink(phone) : null
  const hasAny = phone || email
  if (!hasAny) return <span className="text-xs text-muted-foreground">Sem contato</span>
  return (
    <div className="flex flex-col gap-1 text-sm">
      {phone && (
        <div className="flex items-center gap-2">
          <a href={e164 ? `tel:+${e164}` : undefined} className="inline-flex items-center gap-1 text-foreground hover:text-primary">
            <Phone className="h-3.5 w-3.5" aria-hidden /> {formatPhoneDisplay(phone)}
          </a>
          {waLink && (
            <a href={waLink} target="_blank" rel="noreferrer" title="Abrir WhatsApp"
              className="inline-flex items-center gap-1 text-emerald-600 hover:underline">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
            </a>
          )}
        </div>
      )}
      {email && (
        <a href={`mailto:${email}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary">
          <Mail className="h-3.5 w-3.5" aria-hidden /> {email}
        </a>
      )}
    </div>
  )
}

export function LeadsTable({ leads }: LeadsTableProps) {
  if (leads.length === 0) {
    return (
      <div data-testid="leads-table-empty" className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Users className="h-8 w-8 text-muted-foreground" aria-hidden={true} />
        </div>
        <p className="text-sm font-medium text-foreground">Nenhum lead encontrado</p>
        <p className="text-xs text-muted-foreground mt-1">
          Inicie uma coleta para começar a encontrar leads.
        </p>
      </div>
    )
  }

  return (
    <div data-testid="leads-table" className="rounded-lg border bg-card overflow-hidden">
      {/* Mobile: card list */}
      <div data-testid="leads-table-mobile" className="sm:hidden divide-y divide-border">
        {leads.map((lead) => (
          <div key={lead.id} data-testid={`leads-table-mobile-row-${lead.id}`} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <Link href={Routes.LEAD_DETAIL(lead.id)} className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground hover:text-primary">{lead.name}</p>
                <p className="text-xs text-muted-foreground">{lead.niche ?? lead.city ?? '–'}</p>
              </Link>
              <span className="shrink-0 font-mono text-sm">{lead.score}</span>
            </div>
            <div className="mt-2"><ContactCell phone={lead.phone} email={lead.email} /></div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs">{getTypeLabel(lead.opportunities)}</Badge>
              <Badge variant={getStatusVariant(lead.status)} className="text-xs">{getStatusLabel(lead.status)}</Badge>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div data-testid="leads-table-desktop" className="hidden sm:block overflow-x-auto">
        <table data-testid="leads-table-desktop-table" className="w-full min-w-[760px]">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Negócio</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Contato</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Cidade</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Oportunidade</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Score</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Etapa</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.map((lead) => (
              <tr key={lead.id} data-testid={`leads-table-row-${lead.id}`} className="hover:bg-accent transition-colors">
                <td className="px-4 py-3">
                  <Link href={Routes.LEAD_DETAIL(lead.id)} className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                    {lead.name}
                  </Link>
                  {lead.niche && <div className="text-xs text-muted-foreground">{lead.niche}</div>}
                </td>
                <td className="px-4 py-3"><ContactCell phone={lead.phone} email={lead.email} /></td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{lead.city ?? '–'}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-xs">{getTypeLabel(lead.opportunities)}</Badge>
                </td>
                <td className="px-4 py-3 text-sm font-mono text-foreground">{lead.score}</td>
                <td className="px-4 py-3">
                  <Badge variant={getStatusVariant(lead.status)} className="text-xs">{getStatusLabel(lead.status)}</Badge>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                  {formatDate(lead.createdAt ?? new Date().toISOString())}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
