/**
 * TASK-8 intake-review (CL-299): serializer VCF (vCard RFC 6350) para
 * export de leads. Um cartao por lead, CRLF entre linhas conforme spec.
 */

import type { ExportableLead } from './json'

function escapeVcf(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function leadsToVcf(leads: ExportableLead[]): string {
  const cards: string[] = []
  for (const lead of leads) {
    const lines: string[] = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVcf(lead.businessName)}`,
    ]
    if (lead.phone) lines.push(`TEL;TYPE=WORK,VOICE:${escapeVcf(lead.phone)}`)
    if (lead.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${escapeVcf(lead.email)}`)
    if (lead.businessName) lines.push(`ORG:${escapeVcf(lead.businessName)}`)
    if (lead.website) lines.push(`URL:${escapeVcf(lead.website)}`)
    if (lead.city || lead.state) {
      // ADR: post-office-box ; extended-address ; street ; locality ; region ; postal-code ; country
      lines.push(`ADR;TYPE=WORK:;;;${escapeVcf(lead.city)};${escapeVcf(lead.state)};;BR`)
    }
    if (lead.category) lines.push(`CATEGORIES:${escapeVcf(lead.category)}`)
    lines.push(`NOTE:Score ${lead.score ?? ''} - Status ${lead.status ?? ''}`)
    lines.push('END:VCARD')
    cards.push(lines.join('\r\n'))
  }
  return cards.join('\r\n') + (cards.length ? '\r\n' : '')
}
