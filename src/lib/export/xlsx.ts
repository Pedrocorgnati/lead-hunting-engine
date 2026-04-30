/**
 * M12-G03 (CL-M12-G03): serializer XLSX para export de leads.
 *
 * Alinha BUDGET.md ("exportacao em planilha em quatro formatos diferentes").
 * Saida: buffer XLSX nativo (Office Open XML), aberto por Excel/Google Sheets/LibreOffice.
 *
 * Mantem paridade com CSV (`route.ts`): 13 colunas seguras LGPD.
 */

import * as XLSX from 'xlsx'
import type { ExportableLead } from './json'

const HEADERS = [
  'ID', 'Nome', 'Categoria', 'Cidade', 'Estado', 'Telefone',
  'Site', 'Email', 'Score', 'Temperatura', 'Oportunidades', 'Status', 'Criado em',
]

function rowFromLead(l: ExportableLead): Array<string | number | null> {
  const createdAtStr =
    typeof l.createdAt === 'string'
      ? l.createdAt.split('T')[0]
      : l.createdAt.toISOString().split('T')[0]

  const opportunities = Array.isArray(l.opportunities)
    ? (l.opportunities as unknown[]).join(';')
    : l.opportunities == null
      ? ''
      : String(l.opportunities)

  return [
    l.id,
    l.businessName ?? '',
    l.category ?? '',
    l.city ?? '',
    l.state ?? '',
    l.phone ?? '',
    l.website ?? '',
    l.email ?? '',
    l.score ?? null,
    l.temperature ?? '',
    opportunities,
    l.status ?? '',
    createdAtStr,
  ]
}

export function leadsToXlsxBuffer(leads: ExportableLead[]): Buffer {
  const aoa: Array<Array<string | number | null>> = [HEADERS, ...leads.map(rowFromLead)]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // Auto-width grosso baseado em headers + 1a linha — best-effort, sem percorrer N linhas.
  ws['!cols'] = HEADERS.map((h, i) => {
    const sample = aoa[1]?.[i]
    const len = Math.max(h.length, sample == null ? 0 : String(sample).length)
    return { wch: Math.min(40, Math.max(8, len + 2)) }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return out
}
