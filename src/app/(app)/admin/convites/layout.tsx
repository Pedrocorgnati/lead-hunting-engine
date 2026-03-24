import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Convites — Lead Hunting Engine',
  description: 'Gerencie convites de acesso à plataforma.',
}

export default function ConvitesLayout({ children }: { children: React.ReactNode }) {
  return children
}
