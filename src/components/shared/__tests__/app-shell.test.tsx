import { render, screen } from '@testing-library/react'
import { AppShell } from '../app-shell'

// Mocks dos sub-componentes pesados — testamos apenas a integracao do shell.
jest.mock('../sidebar', () => ({
  Sidebar: ({ mobileOpen }: { mobileOpen: boolean }) => (
    <div data-testid="mock-sidebar">sidebar(mobileOpen={String(mobileOpen)})</div>
  ),
}))
jest.mock('../header', () => ({
  Header: ({ onMobileMenuOpen }: { onMobileMenuOpen: () => void }) => (
    <button data-testid="mock-header" onClick={onMobileMenuOpen}>
      header
    </button>
  ),
}))
jest.mock('../legal-footer', () => ({
  LegalFooter: () => <footer data-testid="mock-legal-footer">legal</footer>,
}))
jest.mock('@/components/mobile/bottom-navigation', () => ({
  BottomNavigation: () => <nav data-testid="mock-bottom-nav">bottom</nav>,
}))
jest.mock('@/components/ui/error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('AppShell', () => {
  it('renderiza Sidebar + Header + main + BottomNavigation + LegalFooter', () => {
    render(
      <AppShell>
        <div data-testid="children-content">conteudo</div>
      </AppShell>
    )
    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.getByTestId('mock-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('mock-header')).toBeInTheDocument()
    expect(screen.getByTestId('main-content')).toBeInTheDocument()
    expect(screen.getByTestId('mock-bottom-nav')).toBeInTheDocument()
    expect(screen.getByTestId('mock-legal-footer')).toBeInTheDocument()
    expect(screen.getByTestId('children-content')).toBeInTheDocument()
  })

  it('main tem id=main-content e tabIndex=-1 (target do skip-to-content)', () => {
    render(
      <AppShell>
        <span>x</span>
      </AppShell>
    )
    const main = screen.getByTestId('main-content')
    expect(main).toHaveAttribute('id', 'main-content')
    expect(main).toHaveAttribute('tabindex', '-1')
  })
})
