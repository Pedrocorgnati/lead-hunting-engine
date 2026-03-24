import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Métricas — Lead Hunting Engine',
  description: 'Visão geral da plataforma em tempo real.',
}

export default function MetricasLayout({ children }: { children: React.ReactNode }) {
  return children
}
