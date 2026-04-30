import { render, screen } from '@testing-library/react'
import { Breadcrumbs } from '../breadcrumbs'

describe('Breadcrumbs', () => {
  it('retorna null para path raiz', () => {
    const { container } = render(<Breadcrumbs pathname="/" />)
    expect(container.firstChild).toBeNull()
  })

  it('renderiza um unico crumb para rota /dashboard', () => {
    render(<Breadcrumbs pathname="/dashboard" />)
    const crumb = screen.getByText('Dashboard')
    expect(crumb).toBeInTheDocument()
    expect(crumb).toHaveAttribute('aria-current', 'page')
  })

  it('renderiza segmentos com link e ultimo com aria-current', () => {
    render(<Breadcrumbs pathname="/admin/convites" />)
    const admin = screen.getByText('Admin')
    const convites = screen.getByText('Convites')
    expect(admin.tagName.toLowerCase()).toBe('a')
    expect(admin).toHaveAttribute('href', '/admin')
    expect(convites).toHaveAttribute('aria-current', 'page')
  })

  it('mapeia rotas pt-BR conhecidas (coletas, perfil, configuracoes)', () => {
    render(<Breadcrumbs pathname="/admin/configuracoes" />)
    expect(screen.getByText('Configurações')).toBeInTheDocument()
  })

  it('truncate de IDs longos para 8 chars + reticencias', () => {
    render(<Breadcrumbs pathname="/leads/abcdef0123456789" />)
    expect(screen.getByText('abcdef01…')).toBeInTheDocument()
  })

  it('exibe Home icon quando showHome=true', () => {
    const { container } = render(<Breadcrumbs pathname="/dashboard" showHome />)
    const homeLink = container.querySelector('a[aria-label="Início"]')
    expect(homeLink).not.toBeNull()
  })

  it('nao exibe Home icon quando showHome=false (default)', () => {
    const { container } = render(<Breadcrumbs pathname="/dashboard" />)
    const homeLink = container.querySelector('a[aria-label="Início"]')
    expect(homeLink).toBeNull()
  })

  it('aplica className customizada no nav', () => {
    render(<Breadcrumbs pathname="/dashboard" className="custom-x" />)
    const nav = screen.getByTestId('breadcrumbs')
    expect(nav.className).toContain('custom-x')
  })
})
