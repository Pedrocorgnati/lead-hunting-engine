'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  coletas: 'Coletas',
  exportar: 'Exportar',
  perfil: 'Perfil',
  admin: 'Admin',
  convites: 'Convites',
  configuracoes: 'Configuracoes',
  scoring: 'Scoring',
  metricas: 'Metricas',
}

interface BreadcrumbsProps {
  className?: string
}

export function Breadcrumbs({ className }: BreadcrumbsProps) {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length <= 1) return null

  const crumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const label = LABELS[segment] ?? segment
    const isLast = index === segments.length - 1
    return { href, label, isLast }
  })

  return (
    <nav aria-label="Breadcrumbs" className={cn('flex items-center gap-1 text-sm text-muted-foreground', className)}>
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
          {crumb.isLast ? (
            <span className="text-foreground font-medium" aria-current="page">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
