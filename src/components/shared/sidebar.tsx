'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/hooks/use-auth'
import { NavItemComponent } from './nav-item'
import { APP_NAV_ITEMS, ADMIN_NAV_GROUPS, type NavGroup, type NavItem } from './nav-config'
import { UserRole } from '@/lib/constants'

const EXACT_ONLY_ROUTES = new Set(['/dashboard', '/admin'])

interface SidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

interface NavContentProps {
  collapsed: boolean
  isAdmin: boolean
  onToggleCollapsed: () => void
  onItemClick?: () => void
}

// Componente top-level (fora de Sidebar) para evitar lint react-hooks/static-components.
// Recebe estado/callbacks via props — sem dependencia de closure do componente pai.
function NavContent({ collapsed, isAdmin, onToggleCollapsed, onItemClick }: NavContentProps) {
  const pathname = usePathname()
  const currentRole = isAdmin ? UserRole.ADMIN : UserRole.OPERATOR
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(ADMIN_NAV_GROUPS.filter((group) => group.defaultOpen).map((group) => group.id))
  )

  const visibleAppItems = APP_NAV_ITEMS.filter((item) => canShowItem(item, currentRole))

  function toggleGroup(groupId: string) {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  return (
    <>
      <div
        data-testid="sidebar-logo"
        className={cn('flex items-center gap-2 px-2 py-3 mb-2', collapsed && 'justify-center')}
      >
        {!collapsed && <span className="text-lg font-bold text-primary">Lead Hunting</span>}
      </div>

      {/* min-h-0 + overflow-y-auto: a lista admin cresceu e precisa rolar sem
          empurrar o botao de recolher para fora da viewport */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        <nav
          data-testid="sidebar-nav-main"
          aria-label="Navegação principal"
          className="flex flex-col gap-1"
        >
          <div className="px-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {!collapsed && 'Trabalho'}
          </div>
          {visibleAppItems.map((item) => (
            <NavItemComponent
              key={item.href}
              item={item}
              collapsed={collapsed}
              onClick={onItemClick}
            />
          ))}
        </nav>

        {isAdmin && (
          <nav
            data-testid="sidebar-nav-admin"
            aria-label="Administração"
            className="flex flex-col gap-1"
          >
            <div className="px-3 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {!collapsed && 'Admin'}
            </div>
            {ADMIN_NAV_GROUPS.map((group) => (
              <NavGroupSection
                key={group.id}
                group={group}
                collapsed={collapsed}
                currentRole={currentRole}
                pathname={pathname}
                open={openGroups.has(group.id) || groupContainsPath(group, pathname)}
                onToggle={() => toggleGroup(group.id)}
                onItemClick={onItemClick}
              />
            ))}
          </nav>
        )}
      </div>

      <button
        data-testid="sidebar-toggle-button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        className={cn(
          'mt-auto flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground',
          'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'hidden md:flex',
          collapsed && 'justify-center px-2'
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-5 w-5" aria-hidden={true} />
        ) : (
          <>
            <PanelLeftClose className="h-5 w-5" aria-hidden={true} />
            <span>Recolher</span>
          </>
        )}
      </button>
    </>
  )
}

function canShowItem(item: NavItem, currentRole: UserRole) {
  return !item.roles || item.roles.includes(currentRole)
}

function groupContainsPath(group: NavGroup, pathname: string) {
  return group.items.some((item) => {
    return pathname === item.href || (!EXACT_ONLY_ROUTES.has(item.href) && pathname.startsWith(`${item.href}/`))
  })
}

interface NavGroupSectionProps {
  group: NavGroup
  collapsed: boolean
  currentRole: UserRole
  pathname: string
  open: boolean
  onToggle: () => void
  onItemClick?: () => void
}

function NavGroupSection({
  group,
  collapsed,
  currentRole,
  pathname,
  open,
  onToggle,
  onItemClick,
}: NavGroupSectionProps) {
  const items = group.items.filter((item) => canShowItem(item, currentRole))
  if (items.length === 0) return null

  return (
    <div data-testid={`sidebar-nav-group-${group.id}`} className="space-y-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`sidebar-nav-group-panel-${group.id}`}
        title={collapsed ? group.label : undefined}
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground',
          'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          collapsed && 'justify-center px-2'
        )}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden={true} />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden={true} />
        )}
        {!collapsed && <span className="truncate">{group.label}</span>}
      </button>

      {open && (
        <div id={`sidebar-nav-group-panel-${group.id}`} className="flex flex-col gap-1">
          {items.map((item) => (
            <NavItemComponent
              key={item.href}
              item={item}
              collapsed={collapsed}
              activePathname={pathname}
              onClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { isAdmin } = useAuth()
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape' && mobileOpen) onMobileClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen, onMobileClose])

  function handleDrawerKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!mobileOpen) return
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button, [tabindex]:not([tabindex="-1"])'
    )
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const toggleCollapsed = () => setCollapsed((c) => !c)

  return (
    <>
      <aside
        data-testid="sidebar"
        className={cn(
          'hidden md:flex flex-col border-r bg-background transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className={cn('flex h-full flex-col gap-1 p-2', collapsed && 'w-16')}>
          <NavContent collapsed={collapsed} isAdmin={isAdmin} onToggleCollapsed={toggleCollapsed} />
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-hidden="true"
          onClick={onMobileClose}
        />
      )}

      <div
        ref={drawerRef}
        data-testid="sidebar-mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        onKeyDown={handleDrawerKeyDown}
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-background border-r shadow-lg transition-transform duration-200 md:hidden',
          // Fechado: alem de off-screen, invisible+inert — senao o dialog
          // aria-modal continua visivel/interativo para AT e focus (bug a11y
          // pego pelo e2e: Escape "fechava" mas o drawer seguia visivel).
          mobileOpen ? 'translate-x-0' : '-translate-x-full invisible'
        )}
        inert={!mobileOpen}
      >
        <div className="flex h-full flex-col gap-1 p-2">
          <NavContent
            collapsed={collapsed}
            isAdmin={isAdmin}
            onToggleCollapsed={toggleCollapsed}
            onItemClick={onMobileClose}
          />
        </div>
      </div>
    </>
  )
}
