import Link from 'next/link'
import { Users } from 'lucide-react'
import { Routes } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { LEAD_STATUS_MAP, OPPORTUNITY_TYPE_MAP } from '@/lib/constants/enums'
import { formatDate } from '@/lib/utils/format'
import type { LeadSummary } from '@/actions/leads'

interface LeadsTableProps {
  leads: LeadSummary[]
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

  const getStatusLabel = (status: string) =>
    LEAD_STATUS_MAP[status as keyof typeof LEAD_STATUS_MAP]?.label ?? status

  const getStatusVariant = (status: string) =>
    LEAD_STATUS_MAP[status as keyof typeof LEAD_STATUS_MAP]?.variant ?? 'secondary'

  const getTypeLabel = (opportunities: string[]) => {
    const first = opportunities?.[0]
    if (!first) return '–'
    return OPPORTUNITY_TYPE_MAP[first as keyof typeof OPPORTUNITY_TYPE_MAP]?.label ?? first
  }

  return (
    <div data-testid="leads-table" className="rounded-lg border bg-card overflow-hidden">
      {/* Mobile: card list */}
      <div data-testid="leads-table-mobile" className="sm:hidden divide-y divide-border">
        {leads.map((lead) => (
          <Link
            key={lead.id}
            href={Routes.LEAD_DETAIL(lead.id)}
            data-testid={`leads-table-mobile-row-${lead.id}`}
            className="block p-4 hover:bg-accent transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{lead.name}</p>
                <p className="text-xs text-muted-foreground">{lead.city ?? '–'}</p>
              </div>
              <div className="flex items-center gap-2 text-right">
                <Badge variant="outline" className="text-xs">
                  {getTypeLabel(lead.opportunities)}
                </Badge>
                <span className="text-sm font-mono">{lead.score}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={getStatusVariant(lead.status)} className="text-xs">
                {getStatusLabel(lead.status)}
              </Badge>
              {lead.category && (
                <span className="text-xs text-muted-foreground">{lead.category}</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop: table */}
      <div data-testid="leads-table-desktop" className="hidden sm:block overflow-x-auto">
        <table data-testid="leads-table-desktop-table" className="w-full min-w-[700px]">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Nome</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Cidade</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Categoria</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Tipo</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Score</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.map((lead) => (
              <tr key={lead.id} data-testid={`leads-table-row-${lead.id}`} className="hover:bg-accent transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={Routes.LEAD_DETAIL(lead.id)}
                    className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {lead.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{lead.city ?? '–'}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{lead.category ?? '–'}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-xs">
                    {getTypeLabel(lead.opportunities)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm font-mono text-foreground">{lead.score}</td>
                <td className="px-4 py-3">
                  <Badge variant={getStatusVariant(lead.status)} className="text-xs">
                    {getStatusLabel(lead.status)}
                  </Badge>
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
