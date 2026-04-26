'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, ChevronRight, User, LogOut, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/hooks/use-auth'
import { useUnreadCount } from '@/lib/hooks/use-unread-count'
import { AvatarInitials } from './avatar-initials'
import { Routes, UserRole } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/ui/theme-toggle'

const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  coletas: 'Coletas',
  exportar: 'Exportar',
  perfil: 'Perfil',
  admin: 'Admin',
  convites: 'Convites',
  configuracoes: 'Configurações',
  scoring: 'Scoring',
  metricas: 'Métricas',
}

function useBreadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  return segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const label = BREADCRUMB_LABELS[segment] ?? segment
    const isLast = index === segments.length - 1
    return { href, label, isLast }
  })
}

interface HeaderProps {
  onMobileMenuOpen: () => void
}

export function Header({ onMobileMenuOpen }: HeaderProps) {
  const router = useRouter()
  const { user, isAdmin, loading, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const breadcrumbs = useBreadcrumbs()
  const { count: unreadCount } = useUnreadCount(Boolean(user))

  return (
    <header data-testid="header" className="flex h-14 items-center gap-4 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:ring-2 focus:ring-ring focus:outline-none text-sm"
      >
        Pular para o conteúdo principal
      </a>

      {/* Hamburguer — mobile only */}
      <button
        data-testid="header-mobile-menu-button"
        onClick={onMobileMenuOpen}
        aria-label="Abrir menu de navegação"
        className={cn(
          'md:hidden p-2 min-h-[44px] min-w-[44px] rounded-lg text-foreground',
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        <Menu className="h-5 w-5" aria-hidden={true} />
      </button>

      {/* Breadcrumbs */}
      <nav data-testid="header-breadcrumbs" className="flex-1 min-w-0" aria-label="Caminho de navegação">
        <ol className="flex items-center gap-1 text-sm text-muted-foreground">
          {breadcrumbs.map((crumb, index) => (
            <li key={crumb.href} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />}
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

      {/* Actions */}
      <div data-testid="header-actions" className="flex items-center gap-2">
        {user && (
          <Link
            href="/notifications"
            data-testid="header-notifications-link"
            aria-label={
              unreadCount > 0
                ? `${unreadCount} notifica${unreadCount === 1 ? 'cao nao lida' : 'coes nao lidas'}`
                : 'Notificacoes'
            }
            className={cn(
              'relative inline-flex items-center justify-center rounded-lg p-2 min-h-[40px] min-w-[40px] text-foreground',
              'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <Bell className="h-5 w-5" aria-hidden={true} />
            {unreadCount > 0 && (
              <span
                data-testid="header-notifications-badge"
                className="absolute top-0 right-0 inline-flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-[18px] text-destructive-foreground"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        )}
        <ThemeToggle />
        {/* User menu */}
        {loading ? (
          <div className="h-9 w-9 rounded-full bg-muted animate-pulse" aria-label="Carregando usuário" />
        ) : user ? (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              data-testid="header-user-menu-button"
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label={`Menu do usuário: ${user.name ?? user.email}`}
            >
              <AvatarInitials name={user.name ?? user.email} size="sm" />
              <span className="hidden md:block max-w-[120px] truncate text-sm font-medium text-foreground">
                {user.name ?? user.email}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="px-3 py-2 border-b mb-1">
                <p className="text-sm font-medium truncate">{user.name ?? 'Usuário'}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                <Badge
                  variant={isAdmin ? 'default' : 'secondary'}
                  className="mt-1 text-xs"
                >
                  {isAdmin ? 'Admin' : 'Operador'}
                </Badge>
              </DropdownMenuLabel>
              <DropdownMenuItem
                data-testid="header-user-menu-profile-item"
                onClick={() => router.push(Routes.PERFIL)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <User className="h-4 w-4" aria-hidden={true} />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="header-user-menu-logout-item"
                onClick={signOut}
                className="flex items-center gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
              >
                <LogOut className="h-4 w-4" aria-hidden={true} />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link
            href={Routes.LOGIN}
            data-testid="header-login-link"
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Entrar
          </Link>
        )}
      </div>
    </header>
  )
}
