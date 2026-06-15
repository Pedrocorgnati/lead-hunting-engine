import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Users, Settings, BarChart3, Wrench, UserRound, FlaskConical, ListTodo, Clock, KeyRound, Tags, Flag, BellRing, Gauge, ScrollText, Archive, ShieldCheck, FileText, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { Routes } from '@/lib/constants/routes'

export const metadata: Metadata = {
  title: 'Painel Admin — Lead Hunting Engine',
}

const ADMIN_SECTION_GROUPS = [
  {
    id: 'essencial',
    title: 'Essencial',
    description: 'Operação que afeta busca, qualidade e estabilidade dos leads.',
    items: [
      {
        href: Routes.ADMIN_CREDENCIAIS,
        label: 'Credenciais e provedores',
        description: 'Chaves, saúde, fallback e operação dos provedores externos.',
        icon: KeyRound,
      },
      {
        href: Routes.ADMIN_OPERADORES,
        label: 'Operadores',
        description: 'Equipe, permissões, métricas e auditoria por usuário.',
        icon: Users,
      },
      {
        href: Routes.ADMIN_JOBS_FILA,
        label: 'Fila de jobs',
        description: 'Coletas em andamento, retry, cancelamento e falhas.',
        icon: ListTodo,
      },
      {
        href: Routes.ADMIN_CONFIGURACOES,
        label: 'Configurações',
        description: 'Parâmetros operacionais do sistema.',
        icon: Settings,
      },
      {
        href: Routes.ADMIN_SCORING,
        label: 'Scoring',
        description: 'Pesos, preview de impacto e regras de qualidade.',
        icon: BarChart3,
      },
    ],
  },
  {
    id: 'monitoramento',
    title: 'Monitoramento',
    description: 'Sinais para diagnosticar custo, saúde e automações.',
    items: [
      {
        href: Routes.ADMIN_ALERTAS,
        label: 'Alertas',
        description: 'Regras e eventos operacionais que exigem atenção.',
        icon: BellRing,
      },
      {
        href: Routes.ADMIN_API_USAGE,
        label: 'Uso de API',
        description: 'Consumo, custo e limites por provedor.',
        icon: Gauge,
      },
      {
        href: Routes.ADMIN_METRICAS,
        label: 'Métricas',
        description: 'Relatórios internos e indicadores administrativos.',
        icon: BarChart3,
      },
      {
        href: Routes.ADMIN_JOBS_CRON,
        label: 'Cron jobs',
        description: 'Rotinas agendadas e execução manual.',
        icon: Clock,
      },
      {
        href: Routes.ADMIN_CLASSIFICACAO,
        label: 'Classificação',
        description: 'Faixas A-E e sinais exigidos por oportunidade.',
        icon: Tags,
      },
      {
        href: Routes.ADMIN_SCORING_VERSOES,
        label: 'Versões de scoring',
        description: 'Snapshots, histórico e comparação de regras.',
        icon: History,
      },
      {
        href: '/admin/dlq',
        label: 'DLQ',
        description: 'Falhas terminais para inspeção e reenfileiramento.',
        icon: Settings,
      },
      {
        href: '/admin/dedup-report',
        label: 'Relatório de dedup',
        description: 'Qualidade do motor de deduplicação.',
        icon: BarChart3,
      },
    ],
  },
  {
    id: 'governanca',
    title: 'Governança',
    description: 'Segurança, privacidade, auditoria e manutenção.',
    items: [
      {
        href: Routes.ADMIN_AUDIT_LOG,
        label: 'Audit log',
        description: 'Trilha de ações administrativas.',
        icon: ScrollText,
      },
      {
        href: Routes.ADMIN_RETENCAO,
        label: 'Retenção',
        description: 'Política de retenção e expurgo de dados.',
        icon: Archive,
      },
      {
        href: Routes.ADMIN_DSAR,
        label: 'DSAR',
        description: 'Requisições LGPD de titulares de dados.',
        icon: ShieldCheck,
      },
      {
        href: Routes.ADMIN_MANUTENCAO,
        label: 'Manutenção',
        description: 'Janelas e avisos de manutenção.',
        icon: Wrench,
      },
      {
        href: Routes.ADMIN_USERS,
        label: 'Usuários legados',
        description: 'Visão antiga de perfis, roles e acessos.',
        icon: UserRound,
      },
    ],
  },
  {
    id: 'baixa-frequencia',
    title: 'Baixa frequência',
    description: 'Áreas auxiliares que não devem competir com a operação diária.',
    items: [
      {
        href: Routes.ADMIN_CONVITES,
        label: 'Convites',
        description: 'Entrada de novos usuários na plataforma.',
        icon: Users,
      },
      {
        href: Routes.ADMIN_CONTEUDO,
        label: 'Conteúdo',
        description: 'Landing, cases, termos e privacidade.',
        icon: FileText,
      },
      {
        href: Routes.ADMIN_FEATURE_FLAGS,
        label: 'Feature flags',
        description: 'Flags por ambiente e trilha de alterações.',
        icon: Flag,
      },
      {
        href: Routes.ADMIN_PROGRAMA_PILOTO,
        label: 'Programa piloto',
        description: 'Cohort, entrevistas e KPIs do piloto.',
        icon: FlaskConical,
      },
      {
        href: '/admin/waitlist',
        label: 'Waitlist',
        description: 'Fila de espera da landing.',
        icon: Users,
      },
      {
        href: '/admin/feedback',
        label: 'Feedback NPS',
        description: 'Respostas NPS coletadas in-app.',
        icon: BarChart3,
      },
    ],
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
          Ajustes essenciais primeiro; diagnóstico, governança e rotinas raras ficam separados.
        </p>
      </div>

      <div className="space-y-8">
        {ADMIN_SECTION_GROUPS.map((group) => (
          <section key={group.id} className="space-y-3" aria-labelledby={`admin-group-${group.id}`}>
            <div>
              <h2 id={`admin-group-${group.id}`} className="text-base font-semibold text-foreground">
                {group.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((section) => {
                const Icon = section.icon
                return (
                  <Link
                    key={section.href}
                    href={section.href}
                    data-testid={`admin-section-${section.label.toLowerCase()}`}
                    className="group rounded-lg border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-md bg-primary/10 p-2">
                        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                          {section.label}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
