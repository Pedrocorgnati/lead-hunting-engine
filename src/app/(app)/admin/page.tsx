import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Users, Settings, BarChart3, Wrench, UserRound, FlaskConical, ListTodo, Clock, Plug, KeyRound, Tags, Flag, BellRing, Gauge, ScrollText, Archive, ShieldCheck, FileText, History } from 'lucide-react'
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
    description: 'Editor de pesos de scoring com preview de impacto e histórico de versões.',
    icon: BarChart3,
  },
  {
    href: '/admin/dlq',
    label: 'DLQ',
    description: 'Jobs em dead-letter: inspecione e reenfileire falhas terminais.',
    icon: Settings,
  },
  {
    href: '/admin/waitlist',
    label: 'Waitlist',
    description: 'Fila de espera da landing: aprove e convide interessados.',
    icon: Users,
  },
  {
    href: '/admin/feedback',
    label: 'Feedback NPS',
    description: 'Dashboard de respostas NPS coletadas in-app.',
    icon: BarChart3,
  },
  {
    href: '/admin/dedup-report',
    label: 'Relatório de dedup',
    description: 'Métricas do motor de deduplicação de leads.',
    icon: BarChart3,
  },
  {
    href: Routes.ADMIN_OPERADORES,
    label: 'Operadores',
    description: 'Taxonomia canônica de operadores: métricas, cohort e auditoria por usuário.',
    icon: Users,
  },
  {
    href: Routes.ADMIN_USERS,
    label: 'Usuários',
    description: 'Gerencie perfis, roles e acessos administrativos (visão legada).',
    icon: UserRound,
  },
  {
    href: Routes.ADMIN_JOBS_FILA,
    label: 'Fila de jobs',
    description: 'Monitore a fila de coletas, faça retry e cancele jobs em lote.',
    icon: ListTodo,
  },
  {
    href: Routes.ADMIN_JOBS_CRON,
    label: 'Cron jobs',
    description: 'Rotinas agendadas do sistema: status, última execução e disparo manual.',
    icon: Clock,
  },
  {
    href: Routes.ADMIN_PROVEDORES,
    label: 'Provedores',
    description: 'Status, saúde e quota dos provedores de dados externos.',
    icon: Plug,
  },
  {
    href: Routes.ADMIN_CREDENCIAIS,
    label: 'Credenciais',
    description: 'Rota canônica de credenciais de API por provedor.',
    icon: KeyRound,
  },
  {
    href: Routes.ADMIN_SCORING_VERSOES,
    label: 'Versões de scoring',
    description: 'Histórico versionado das regras de scoring com snapshot e diff.',
    icon: History,
  },
  {
    href: Routes.ADMIN_CLASSIFICACAO,
    label: 'Classificação',
    description: 'Faixas de classificação de oportunidade (A-E) e sinais exigidos.',
    icon: Tags,
  },
  {
    href: Routes.ADMIN_FEATURE_FLAGS,
    label: 'Feature flags',
    description: 'Flags por ambiente com trilha de auditoria de mudanças.',
    icon: Flag,
  },
  {
    href: Routes.ADMIN_ALERTAS,
    label: 'Alertas',
    description: 'Alertas operacionais: regras, disparos e reconhecimento.',
    icon: BellRing,
  },
  {
    href: Routes.ADMIN_API_USAGE,
    label: 'Uso de API',
    description: 'Consumo, custo e limites das APIs externas por provedor.',
    icon: Gauge,
  },
  {
    href: Routes.ADMIN_AUDIT_LOG,
    label: 'Audit log',
    description: 'Trilha de auditoria de todas as ações administrativas.',
    icon: ScrollText,
  },
  {
    href: Routes.ADMIN_RETENCAO,
    label: 'Retenção',
    description: 'Política de retenção e expurgo de dados (LGPD).',
    icon: Archive,
  },
  {
    href: Routes.ADMIN_DSAR,
    label: 'DSAR',
    description: 'Fila de requisições de titulares de dados (LGPD).',
    icon: ShieldCheck,
  },
  {
    href: Routes.ADMIN_CONTEUDO,
    label: 'Conteúdo',
    description: 'Conteúdo editorial: landing, cases, termos e privacidade.',
    icon: FileText,
  },
  {
    href: Routes.ADMIN_MANUTENCAO,
    label: 'Manutenção',
    description: 'Ative, agende e publique avisos de manutenção da plataforma.',
    icon: Wrench,
  },
  {
    href: Routes.ADMIN_PROGRAMA_PILOTO,
    label: 'Programa piloto',
    description: 'Cohort, KPIs, entrevistas e relatório exportável do programa piloto.',
    icon: FlaskConical,
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

  if (profile?.role !== 'ADMIN') redirect('/erro/403')

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
