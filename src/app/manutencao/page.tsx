import type { Metadata } from 'next'
import { MaintenancePageClient } from './MaintenancePageClient'

export const metadata: Metadata = {
  title: 'Manutenção',
  description: 'Status público da janela de manutenção do Lead Hunting Engine.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function MaintenancePage() {
  return <MaintenancePageClient />
}
