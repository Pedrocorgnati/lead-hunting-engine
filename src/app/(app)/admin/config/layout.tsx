import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Configuração do sistema — Lead Hunting Engine',
  description: 'Regiões, nichos, limites, scrapers e regras de scoring.',
}

export default function AdminConfigLayout({ children }: { children: React.ReactNode }) {
  return children
}
