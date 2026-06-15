import type { Metadata } from 'next'
import { OutreachCenter } from './_components/OutreachCenter'

export const metadata: Metadata = {
  title: 'Outreach — Centro de Operação',
}

/**
 * outreach-engine (brainstorm 06-10, tasks 15/29): Centro de Outreach +
 * Painel de Saúde Operacional. Server Component fino (Next 16: page.tsx
 * Server, interatividade isolada no Client Component).
 */
export default function AdminOutreachPage() {
  return <OutreachCenter />
}
