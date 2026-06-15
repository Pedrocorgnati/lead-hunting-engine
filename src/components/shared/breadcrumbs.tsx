'use client'

import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// Mapa unificado de rotulos por slug. Manter consolidado aqui para que Header,
// layout autenticado e qualquer outro consumidor compartilhem a mesma fonte.
const SLUG_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  coletas: 'Coletas',
  radar: 'Radar',
  exportar: 'Exportar',
  perfil: 'Perfil',
  admin: 'Admin',
  users: 'Usuários',
  convites: 'Convites',
  config: 'Configuração',
  configuracoes: 'Configurações',
  scoring: 'Scoring',
  metricas: 'Métricas',
  regions: 'Regiões',
  niches: 'Nichos',
  limits: 'Limites',
  scrapers: 'Scrapers',
  providers: 'Providers',
  settings: 'Configurações',
  notifications: 'Notificações',
  'audit-log': 'Audit Log',
}

function labelFor(slug: string): string {
  if (SLUG_LABELS[slug]) return SLUG_LABELS[slug]
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

interface BreadcrumbsProps {
  className?: string
  showHome?: boolean
  pathname?: string
}

export function Breadcrumbs({ className, showHome = false, pathname }: BreadcrumbsProps) {
  const livePathname = usePathname()
  const current = pathname ?? livePathname
  if (!current || current === '/') return null

  const segments = current.split('/').filter(Boolean)
  if (segments.length === 0) return null

  const crumbs = segments.map((slug, idx) => {
    const href = '/' + segments.slice(0, idx + 1).join('/')
    const isLast = idx === segments.length - 1
    const isId = /^[0-9a-f-]{8,}$/i.test(slug)
    const label = isId ? slug.slice(0, 8) + '…' : labelFor(slug)
    return { href, label, isLast }
  })

  return (
    <nav
      data-testid="breadcrumbs"
      aria-label="Caminho de navegação"
      className={cn('flex items-center gap-1 text-sm text-muted-foreground', className)}
    >
      <ol className="flex items-center gap-1">
        {showHome && (
          <li className="flex items-center gap-1">
            <Link href="/" aria-label="Início" className="hover:text-foreground transition-colors">
              <Home className="h-3.5 w-3.5" aria-hidden={true} />
            </Link>
          </li>
        )}
        {crumbs.map((crumb, i) => (
          <li key={crumb.href} className="flex items-center gap-1">
            {(showHome || i > 0) && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />
            )}
            {crumb.isLast ? (
              <span className="font-medium text-foreground truncate" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="hover:text-foreground transition-colors truncate"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
