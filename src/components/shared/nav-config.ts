import { LayoutDashboard, Users, Zap, Download, Settings, Mail, SlidersHorizontal, BarChart3, Home, Activity, ScrollText, Wrench, FlaskConical, FileText } from 'lucide-react'
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
    href: Routes.ADMIN_CONVITES,
    label: 'Convites',
    icon: Mail,
    tooltip: 'Convites',
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
    href: Routes.ADMIN_CONFIG_SCORING,
    label: 'Scoring',
    icon: SlidersHorizontal,
    tooltip: 'Scoring',
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
    href: Routes.ADMIN_USERS,
    label: 'Usuários',
    icon: Users,
    tooltip: 'Usuários',
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
