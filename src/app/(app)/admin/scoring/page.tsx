import { redirect } from 'next/navigation'
import { Routes } from '@/lib/constants/routes'

// Scoring rules are managed in the Configurações page
export default function ScoringPage() {
  redirect(Routes.ADMIN_CONFIGURACOES)
}
