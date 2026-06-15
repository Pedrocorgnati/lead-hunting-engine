import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { PilotProgramDashboard } from '@/components/admin/PilotProgramDashboard'

export const metadata: Metadata = {
  title: 'Programa piloto — Admin',
  description: 'Cohort, KPIs, entrevistas e relatorio exportavel do programa piloto.',
  robots: { index: false, follow: false },
}

/**
 * /admin/programa-piloto (AD30) — Task 56 / C6.
 *
 * Consolida o programa piloto numa taxonomia admin propria: cohort por tags
 * `pilot-{periodo}` (reuso de M14-G-010), KPIs derivados (leads, NPS),
 * agendamento de entrevistas via notificacao e relatorio CSV. Nao duplica
 * dados de waitlist — apenas os reaproveita.
 */
export default async function ProgramaPilotoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await prisma.userProfile.findUnique({
    where: { id: user.id },
    select: { role: true },
  })
  if (profile?.role !== 'ADMIN') redirect('/erro/403')

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Programa piloto</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie o cohort, acompanhe KPIs, agende entrevistas e exporte o relatorio do programa.
        </p>
      </div>
      <PilotProgramDashboard />
    </div>
  )
}
