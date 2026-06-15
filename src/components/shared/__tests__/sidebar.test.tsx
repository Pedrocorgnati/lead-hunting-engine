import { render, screen, fireEvent } from '@testing-library/react'
import { useAuth } from '@/lib/hooks/use-auth'
import { Sidebar } from '../sidebar'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

describe('Sidebar', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'op@example.com', name: 'Op', role: 'OPERATOR' as const },
      isAdmin: false,
      loading: false,
      signOut: jest.fn(),
    } as ReturnType<typeof useAuth>)
  })

  it('renderiza nav principal e itens APP_NAV', () => {
    render(<Sidebar mobileOpen={false} onMobileClose={() => {}} />)
    expect(screen.getAllByTestId('sidebar-nav-main').length).toBeGreaterThan(0)
  })

  it('prioriza Nova busca no topo da navegacao principal', () => {
    render(<Sidebar mobileOpen={false} onMobileClose={() => {}} />)
    const mainNav = screen.getAllByTestId('sidebar-nav-main')[0]
    const links = mainNav.querySelectorAll('a')
    expect(links[0]).toHaveTextContent('Nova busca')
    expect(links[1]).toHaveTextContent('Leads')
  })

  it('NAO renderiza secao admin para usuario nao admin', () => {
    render(<Sidebar mobileOpen={false} onMobileClose={() => {}} />)
    expect(screen.queryAllByTestId('sidebar-nav-admin')).toHaveLength(0)
  })

  it('NAO mostra Contato admin-only para operador', () => {
    render(<Sidebar mobileOpen={false} onMobileClose={() => {}} />)
    expect(screen.queryByText('Contato')).not.toBeInTheDocument()
  })

  it('renderiza secao admin para usuario admin', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'a@example.com', name: 'A', role: 'ADMIN' as const },
      isAdmin: true,
      loading: false,
      signOut: jest.fn(),
    } as ReturnType<typeof useAuth>)
    render(<Sidebar mobileOpen={false} onMobileClose={() => {}} />)
    expect(screen.getAllByTestId('sidebar-nav-admin').length).toBeGreaterThan(0)
  })

  it('agrupa admin e mantem categorias de baixa frequencia recolhidas', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'a@example.com', name: 'A', role: 'ADMIN' as const },
      isAdmin: true,
      loading: false,
      signOut: jest.fn(),
    } as ReturnType<typeof useAuth>)
    render(<Sidebar mobileOpen={false} onMobileClose={() => {}} />)

    expect(screen.getAllByTestId('sidebar-nav-group-admin-essencial').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Credenciais').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Baixa frequência').length).toBeGreaterThan(0)
    expect(screen.queryByText('Programa piloto')).not.toBeInTheDocument()
    expect(screen.queryByText('Provedores')).not.toBeInTheDocument()
  })

  it('toggle button alterna aria-expanded', () => {
    render(<Sidebar mobileOpen={false} onMobileClose={() => {}} />)
    const toggles = screen.getAllByTestId('sidebar-toggle-button')
    const toggle = toggles[0]
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('drawer mobile tem role=dialog e aria-modal=true', () => {
    render(<Sidebar mobileOpen={true} onMobileClose={() => {}} />)
    const drawer = screen.getByTestId('sidebar-mobile-drawer')
    expect(drawer).toHaveAttribute('role', 'dialog')
    expect(drawer).toHaveAttribute('aria-modal', 'true')
    expect(drawer).toHaveAttribute('aria-label', 'Menu de navegação')
  })

  it('Escape global fecha drawer (chama onMobileClose)', () => {
    const onMobileClose = jest.fn()
    render(<Sidebar mobileOpen={true} onMobileClose={onMobileClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onMobileClose).toHaveBeenCalled()
  })

  it('Escape NAO fecha quando drawer fechado (mobileOpen=false)', () => {
    const onMobileClose = jest.fn()
    render(<Sidebar mobileOpen={false} onMobileClose={onMobileClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onMobileClose).not.toHaveBeenCalled()
  })
})
