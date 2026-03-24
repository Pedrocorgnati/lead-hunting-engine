import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Users, Settings, BarChart3, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { Routes } from '@/lib/constants/routes'

export const metadata: Metadata = {
  title: 'Painel Admin — Lead Hunting Engine',
}

const ADMIN_SECTIONS = [
  {
    href: Routes.ADMIN_CONVITES,
    label: 'Convites',
    description: 'Gerencie convites e acesso de usuários à plataforma.',
    icon: Users,
  },
  {
    href: Routes.ADMIN_CONFIGURACOES,
    label: 'Configurações',
    description: 'Configure credenciais de API e integrações externas.',
    icon: Settings,
  },
  {
    href: Routes.ADMIN_SCORING,
    label: 'Scoring',
    description: 'Ajuste as regras e pesos do sistema de scoring de leads.',
    icon: BarChart3,
  },
]

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await prisma.userProfile.findUnique({
    where: { id: user.id },
    select: { role: true },
  })

  if (profile?.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div data-testid="admin-page" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Painel Administrativo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie configurações, convites e regras de scoring da plataforma.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <Link
              key={section.href}
              href={section.href}
              data-testid={`admin-section-${section.label.toLowerCase()}`}
              className="group rounded-xl border bg-card p-6 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <h2 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                  {section.label}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
