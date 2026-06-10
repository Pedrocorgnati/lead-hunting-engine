import { LayoutDashboard, Users, Zap, Download, Settings, Mail, SlidersHorizontal, BarChart3, Home, Activity, ScrollText, Wrench, FlaskConical, FileText, ListTodo, Clock, Plug, KeyRound, Tags, Flag, BellRing, Gauge, Archive, ShieldCheck } from 'lucide-react'
import { Routes, UserRole } from '@/lib/constants'

export interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  tooltip: string
  roles?: UserRole[]
}

export const APP_NAV_ITEMS: NavItem[] = [
  {
    href: Routes.DASHBOARD,
    label: 'Dashboard',
    icon: LayoutDashboard,
    tooltip: 'Dashboard',
  },
  {
    href: Routes.RADAR,
    label: 'Radar',
    icon: Activity,
    tooltip: 'Radar — leads das últimas 24h',
  },
  {
    href: Routes.LEADS,
    label: 'Leads',
    icon: Users,
    tooltip: 'Leads',
  },
  {
    href: Routes.COLETAS,
    label: 'Coletas',
    icon: Zap,
    tooltip: 'Coletas',
  },
  {
    href: Routes.EXPORTAR,
    label: 'Exportar',
    icon: Download,
    tooltip: 'Exportar',
  },
  {
    href: Routes.TEMPLATES_PITCH,
    label: 'Templates',
    icon: FileText,
    tooltip: 'Templates de pitch',
  },
]

export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    href: Routes.ADMIN,
    label: 'Painel Admin',
    icon: Home,
    tooltip: 'Painel Admin',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_OPERADORES,
    label: 'Operadores',
    icon: Users,
    tooltip: 'Operadores — taxonomia canônica (visão legada em /admin/users)',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_CONVITES,
    label: 'Convites',
    icon: Mail,
    tooltip: 'Convites',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_JOBS_FILA,
    label: 'Fila de jobs',
    icon: ListTodo,
    tooltip: 'Fila de jobs — monitorar e intervir em coletas',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_JOBS_CRON,
    label: 'Cron jobs',
    icon: Clock,
    tooltip: 'Rotinas agendadas (cron) do sistema',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_PROVEDORES,
    label: 'Provedores',
    icon: Plug,
    tooltip: 'Status e saúde dos provedores de dados',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_CREDENCIAIS,
    label: 'Credenciais',
    icon: KeyRound,
    tooltip: 'Credenciais de API dos provedores',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_CONFIGURACOES,
    label: 'Configurações',
    icon: Settings,
    tooltip: 'Configurações',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_CONTEUDO,
    label: 'Conteudo',
    icon: FileText,
    tooltip: 'Conteudo editorial — onde editar landing, cases, termos e privacidade',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_SCORING,
    label: 'Scoring',
    icon: SlidersHorizontal,
    tooltip: 'Scoring — editor de pesos com preview e versoes',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_CLASSIFICACAO,
    label: 'Classificação',
    icon: Tags,
    tooltip: 'Faixas de classificação de oportunidade (A-E)',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_FEATURE_FLAGS,
    label: 'Feature flags',
    icon: Flag,
    tooltip: 'Feature flags por ambiente',
    roles: [UserRole.ADMIN],
  },
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
    tooltip: 'Métricas',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_AUDIT_LOG,
    label: 'Audit log',
    icon: ScrollText,
    tooltip: 'Audit log',
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
    tooltip: 'Fila de requisições de titulares (LGPD)',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_MANUTENCAO,
    label: 'Manutenção',
    icon: Wrench,
    tooltip: 'Manutenção',
    roles: [UserRole.ADMIN],
  },
  {
    href: Routes.ADMIN_PROGRAMA_PILOTO,
    label: 'Programa piloto',
    icon: FlaskConical,
    tooltip: 'Programa piloto',
    roles: [UserRole.ADMIN],
  },
]
