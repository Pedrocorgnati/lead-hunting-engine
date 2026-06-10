import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { Routes } from '@/lib/constants/routes'
import { ScoringRulesForm } from '@/components/admin/scoring-rules-form'

/**
 * AD8 /admin/scoring — editor dedicado de scoring (B17).
 *
 * Renderiza o editor real (pesos + preview de impacto + historico por regra),
 * sem redirecionar para /admin/config/scoring. A tela de versoes (AD9) vive em
 * /admin/scoring/versoes e e linkada daqui.
 */
export const metadata: Metadata = { title: 'Scoring — Admin' }

export default async function ScoringPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await prisma.userProfile.findUnique({
    where: { id: user.id },
    select: { role: true },
  })
  if (profile?.role !== 'ADMIN') redirect('/erro/403')

  return (
    <div data-testid="admin-scoring-page" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ajuste os pesos das dimensoes de scoring com preview de impacto. A soma deve fechar em 100.
          </p>
        </div>
        <Link
          href={Routes.ADMIN_SCORING_VERSOES}
          data-testid="scoring-versoes-link"
          className="flex items-center gap-2 px-4 py-2 border text-sm font-medium rounded-lg hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <History className="h-4 w-4" aria-hidden="true" />
          Historico de versoes
        </Link>
      </div>

      <ScoringRulesForm />
    </div>
  )
}
