'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/hooks/use-auth'
import { NavItemComponent } from './nav-item'
import { APP_NAV_ITEMS, ADMIN_NAV_ITEMS } from './nav-config'

interface SidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { isAdmin } = useAuth()
  const drawerRef = useRef<HTMLDivElement>(null)

  // Close mobile drawer on Escape
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape' && mobileOpen) onMobileClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen, onMobileClose])

  // Focus trap for mobile drawer
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

  const NavContent = ({ onClick }: { onClick?: () => void }) => (
    <>
      {/* Logo */}
      <div data-testid="sidebar-logo" className={cn('flex items-center gap-2 px-2 py-3 mb-2', collapsed && 'justify-center')}>
        {!collapsed && (
          <span className="text-lg font-bold text-primary">Lead Hunting</span>
        )}
      </div>

      {/* App nav */}
      <nav data-testid="sidebar-nav-main" aria-label="Navegação principal" className="flex flex-col gap-1">
        {APP_NAV_ITEMS.map((item) => (
          <NavItemComponent key={item.href} item={item} collapsed={collapsed} onClick={onClick} />
        ))}
      </nav>

      {/* Admin section */}
      {isAdmin && (
        <nav data-testid="sidebar-nav-admin" aria-label="Administração" className="flex flex-col gap-1">
          <div className="px-3 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {!collapsed && 'Admin'}
          </div>
          {ADMIN_NAV_ITEMS.map((item) => (
            <NavItemComponent key={item.href} item={item} collapsed={collapsed} onClick={onClick} />
          ))}
        </nav>
      )}

      {/* Collapse toggle — desktop only */}
      <button
        data-testid="sidebar-toggle-button"
        onClick={() => setCollapsed(!collapsed)}
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

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        data-testid="sidebar"
        className={cn(
          'hidden md:flex flex-col border-r bg-background transition-all duration-200 ease-in-out',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className={cn('flex h-full flex-col gap-1 p-2', collapsed && 'w-16')}>
          <NavContent />
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-hidden="true"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile drawer */}
      <div
        ref={drawerRef}
        data-testid="sidebar-mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        onKeyDown={handleDrawerKeyDown}
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-background border-r shadow-lg transition-transform duration-200 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col gap-1 p-2">
          <NavContent onClick={onMobileClose} />
        </div>
      </div>
    </>
  )
}
