import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Coletas — Lead Hunting Engine',
  description: 'Gerencie coletas automatizadas de leads.',
}

export default function ColetasLayout({ children }: { children: React.ReactNode }) {
  return children
}
