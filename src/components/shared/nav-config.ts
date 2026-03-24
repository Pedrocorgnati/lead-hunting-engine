import { LayoutDashboard, Users, Zap, Download, Settings, Mail, SlidersHorizontal, BarChart3, Home } from 'lucide-react'
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
    href: Routes.ADMIN_SCORING,
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
]
