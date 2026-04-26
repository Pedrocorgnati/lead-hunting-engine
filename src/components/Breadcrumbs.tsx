'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'

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
  onboarding: 'Onboarding',
}

function labelFor(slug: string): string {
  return SLUG_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1)
}

interface BreadcrumbsProps {
  pathname?: string
}

export function Breadcrumbs({ pathname }: BreadcrumbsProps = {}) {
  const current = pathname ?? usePathname()
  if (!current || current === '/') return null

  const parts = current.split('/').filter(Boolean)
  if (parts.length === 0) return null

  const crumbs = parts.map((slug, idx) => {
    const href = '/' + parts.slice(0, idx + 1).join('/')
    const isLast = idx === parts.length - 1
    const isId = /^[0-9a-f-]{8,}$/i.test(slug)
    const label = isId ? slug.slice(0, 8) + '…' : labelFor(slug)
    return { href, label, isLast }
  })

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href="/" aria-label="Início" className="hover:text-foreground">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((c) => (
        <span key={c.href} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          {c.isLast ? (
            <span className="font-medium text-foreground">{c.label}</span>
          ) : (
            <Link href={c.href} className="hover:text-foreground">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
