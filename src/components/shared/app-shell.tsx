'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { LegalFooter } from './legal-footer'
import { BottomNavigation } from '@/components/mobile/bottom-navigation'
import { ErrorBoundary } from '@/components/ui/error-boundary'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div data-testid="app-shell" className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMobileMenuOpen={() => setMobileOpen(true)} />
        <main
          id="main-content"
          data-testid="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-4 pb-20 md:pb-6 md:p-6 lg:p-8 focus-visible:outline-none"
        >
          <ErrorBoundary>{children}</ErrorBoundary>
          <LegalFooter />
        </main>
        <BottomNavigation />
      </div>
    </div>
  )
}
