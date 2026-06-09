import { redirect } from 'next/navigation'
import { Routes } from '@/lib/constants'

export default function ScoringPage() {
  redirect(Routes.ADMIN_CONFIG_SCORING)
}
