import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { Routes } from '@/lib/constants/routes'

export const metadata: Metadata = {
  title: 'Convites — Lead Hunting Engine',
  description: 'Gerencie convites de acesso à plataforma.',
}

export const dynamic = 'force-dynamic'

export default async function ConvitesLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  if (!user || user.role !== 'ADMIN') {
    redirect('/erro/403')
  }
  return children
}
