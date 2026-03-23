'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { NavItem } from './nav-config'

interface NavItemProps {
  item: NavItem
  collapsed?: boolean
  onClick?: () => void
}

export function NavItemComponent({ item, collapsed = false, onClick }: NavItemProps) {
  const pathname = usePathname()
  const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  const Icon = item.icon
  const slug = item.href.split('/').filter(Boolean).join('-') || 'home'

  return (
    <Link
      href={item.href}
      data-testid={`sidebar-nav-item-${slug}`}
      title={collapsed ? item.tooltip : undefined}
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
        collapsed && 'justify-center px-2',
        isActive
          ? 'bg-primary/10 text-primary font-semibold'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden={true} />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  )
}
