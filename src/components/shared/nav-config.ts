import type { ComponentType } from 'react'
import { LayoutDashboard, Users, Zap, Download, Settings, Mail, SlidersHorizontal, BarChart3, Activity, ScrollText, Wrench, FlaskConical, FileText, ListTodo, Clock, KeyRound, Tags, Flag, BellRing, Gauge, Archive, ShieldCheck } from 'lucide-react'
import { Routes, UserRole } from '@/lib/constants'

export interface NavItem {
  href: string
  label: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  tooltip: string
  roles?: UserRole[]
}

export interface NavGroup {
  id: string
  label: string
  defaultOpen?: boolean
  items: NavItem[]
}

export const APP_NAV_ITEMS: NavItem[] = [
  {
    href: Routes.COLETAS,
    label: 'Nova busca',
    icon: Zap,
    tooltip: 'Criar e acompanhar buscas de leads',
  },
  {
    href: Routes.LEADS,
    label: 'Leads',
    icon: Users,
    tooltip: 'Leads captados e prontos para qualificação',
  },
  {
    href: Routes.ADMIN_OUTREACH,
    label: 'Contato',
    icon: Mail,
    tooltip: 'Centro de contato e campanhas',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.RADAR,
    label: 'Radar',
    icon: Activity,
    tooltip: 'Leads recentes e recorrência das últimas 24h',
  },
  {
    href: Routes.EXPORTAR,
    label: 'Exportar',
    icon: Download,
    tooltip: 'Exportar leads e relatórios',
  },
  {
    href: Routes.DASHBOARD,
    label: 'Dashboard',
    icon: LayoutDashboard,
    tooltip: 'Resumo operacional',
  },
  {
    href: Routes.TEMPLATES_PITCH,
    label: 'Templates',
    icon: FileText,
    tooltip: 'Templates de pitch',
  },
]

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    id: 'admin-essencial',
    label: 'Admin essencial',
    defaultOpen: true,
    items: [
      {
        href: Routes.ADMIN_CREDENCIAIS,
        label: 'Credenciais',
        icon: KeyRound,
        tooltip: 'Credenciais, status e operação dos provedores',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_OPERADORES,
        label: 'Operadores',
        icon: Users,
        tooltip: 'Operadores, permissões e auditoria por usuário',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_JOBS_FILA,
        label: 'Fila de jobs',
        icon: ListTodo,
        tooltip: 'Monitorar e intervir em coletas',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_CONFIGURACOES,
        label: 'Configurações',
        icon: Settings,
        tooltip: 'Configurações operacionais do sistema',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_SCORING,
        label: 'Scoring',
        icon: SlidersHorizontal,
        tooltip: 'Pesos, preview e qualidade dos leads',
        roles: [UserRole.ADMIN],
      },
    ],
  },
  {
    id: 'admin-monitoramento',
    label: 'Monitoramento',
    items: [
      {
        href: Routes.ADMIN_ALERTAS,
        label: 'Alertas',
        icon: BellRing,
        tooltip: 'Alertas operacionais e regras de notificação',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_API_USAGE,
        label: 'Uso de API',
        icon: Gauge,
        tooltip: 'Consumo e custo de APIs externas',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_METRICAS,
        label: 'Métricas',
        icon: BarChart3,
        tooltip: 'Métricas administrativas e relatórios internos',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_JOBS_CRON,
        label: 'Cron jobs',
        icon: Clock,
        tooltip: 'Rotinas agendadas do sistema',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_CLASSIFICACAO,
        label: 'Classificação',
        icon: Tags,
        tooltip: 'Faixas de classificação de oportunidade',
        roles: [UserRole.ADMIN],
      },
    ],
  },
  {
    id: 'admin-governanca',
    label: 'Governança',
    items: [
      {
        href: Routes.ADMIN_AUDIT_LOG,
        label: 'Audit log',
        icon: ScrollText,
        tooltip: 'Trilha de auditoria administrativa',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_RETENCAO,
        label: 'Retenção',
        icon: Archive,
        tooltip: 'Política de retenção e expurgo de dados',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_DSAR,
        label: 'DSAR',
        icon: ShieldCheck,
        tooltip: 'Requisições de titulares de dados',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_MANUTENCAO,
        label: 'Manutenção',
        icon: Wrench,
        tooltip: 'Janelas e avisos de manutenção',
        roles: [UserRole.ADMIN],
      },
    ],
  },
  {
    id: 'admin-baixa-frequencia',
    label: 'Baixa frequência',
    items: [
      {
        href: Routes.ADMIN,
        label: 'Todos os ajustes',
        icon: LayoutDashboard,
        tooltip: 'Hub administrativo completo',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_CONVITES,
        label: 'Convites',
        icon: Mail,
        tooltip: 'Convites de acesso',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_CONTEUDO,
        label: 'Conteúdo',
        icon: FileText,
        tooltip: 'Landing, cases, termos e privacidade',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_FEATURE_FLAGS,
        label: 'Feature flags',
        icon: Flag,
        tooltip: 'Flags por ambiente',
        roles: [UserRole.ADMIN],
      },
      {
        href: Routes.ADMIN_PROGRAMA_PILOTO,
        label: 'Programa piloto',
        icon: FlaskConical,
        tooltip: 'Cohort, entrevistas e KPIs do piloto',
        roles: [UserRole.ADMIN],
      },
    ],
  },
]

export const ADMIN_NAV_ITEMS: NavItem[] = ADMIN_NAV_GROUPS.flatMap((group) => group.items)
