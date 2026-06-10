'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Zap, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Routes } from '@/lib/constants'

const NAV_ITEMS = [
  { href: Routes.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
  { href: Routes.LEADS, label: 'Leads', icon: Users },
  { href: Routes.COLETAS, label: 'Coletas', icon: Zap },
  { href: Routes.PERFIL, label: 'Perfil', icon: User },
] as const

export function BottomNavigation() {
  const pathname = usePathname()

  // bg OPACO no <nav>: o fundo translucido (/95 + blur) fazia o axe computar
  // a cor efetiva misturada com o conteudo atras (ex.: #cccccc) e o item
  // ativo text-primary reprovava contraste de forma nao-deterministica.
  return (
    <nav
      data-testid="bottom-navigation"
      aria-label="Navegação principal"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background"
    >
      <div className="flex h-16 items-center justify-around px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-lg min-h-[44px] min-w-[44px] transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
