import { redirect } from 'next/navigation'
import { Routes } from '@/lib/constants/routes'

export default function ProvedoresPage() {
  redirect(Routes.ADMIN_CREDENCIAIS)
}
