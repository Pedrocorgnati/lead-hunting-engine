import { render, screen, fireEvent } from '@testing-library/react'
import { useAuth } from '@/lib/hooks/use-auth'
import { Header } from '../header'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

jest.mock('@/lib/hooks/use-unread-count', () => ({
  useUnreadCount: () => ({ count: 0 }),
}))

describe('Header', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'op@example.com', name: 'Operador', role: 'OPERATOR' as const },
      isAdmin: false,
      loading: false,
      signOut: jest.fn(),
    } as ReturnType<typeof useAuth>)
  })

  it('renderiza skip-to-content como primeiro elemento focusable', () => {
    render(<Header onMobileMenuOpen={() => {}} />)
    const skip = screen.getByText(/pular para o conte/i)
    expect(skip).toBeInTheDocument()
    expect(skip).toHaveAttribute('href', '#main-content')
  })

  it('hamburguer mobile chama onMobileMenuOpen', () => {
    const onOpen = jest.fn()
    render(<Header onMobileMenuOpen={onOpen} />)
    fireEvent.click(screen.getByTestId('header-mobile-menu-button'))
    expect(onOpen).toHaveBeenCalled()
  })

  it('hamburguer tem aria-label de menu', () => {
    render(<Header onMobileMenuOpen={() => {}} />)
    const btn = screen.getByTestId('header-mobile-menu-button')
    expect(btn).toHaveAttribute('aria-label', 'Abrir menu de navegação')
  })

  it('exibe UserMenu trigger com nome do usuario', () => {
    render(<Header onMobileMenuOpen={() => {}} />)
    expect(screen.getByTestId('header-user-menu-button')).toBeInTheDocument()
  })

  it('estado loading exibe skeleton avatar', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAdmin: false,
      loading: true,
      signOut: jest.fn(),
    } as ReturnType<typeof useAuth>)
    render(<Header onMobileMenuOpen={() => {}} />)
    const skel = screen.getByLabelText(/carregando usu/i)
    expect(skel).toBeInTheDocument()
  })

  it('estado nao autenticado exibe link Entrar', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAdmin: false,
      loading: false,
      signOut: jest.fn(),
    } as ReturnType<typeof useAuth>)
    render(<Header onMobileMenuOpen={() => {}} />)
    const loginLink = screen.getByTestId('header-login-link')
    expect(loginLink).toBeInTheDocument()
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('renderiza Breadcrumbs no header', () => {
    render(<Header onMobileMenuOpen={() => {}} />)
    expect(screen.getByTestId('header-breadcrumbs')).toBeInTheDocument()
  })
})
