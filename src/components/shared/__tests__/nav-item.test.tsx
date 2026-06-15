import { render, screen } from '@testing-library/react'
import { usePathname } from 'next/navigation'
import { LayoutDashboard } from 'lucide-react'
import { NavItemComponent } from '../nav-item'
import type { NavItem } from '../nav-config'

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>

const dashboardItem: NavItem = {
  href: '/dashboard',
  label: 'Dashboard',
  icon: LayoutDashboard,
  tooltip: 'Dashboard',
}

describe('NavItemComponent', () => {
  beforeEach(() => {
    mockUsePathname.mockReset()
  })

  it('marca aria-current="page" quando rota e exata', () => {
    mockUsePathname.mockReturnValue('/dashboard')
    render(<NavItemComponent item={dashboardItem} />)
    const link = screen.getByTestId('sidebar-nav-item-dashboard')
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('nao marca aria-current quando rota diverge', () => {
    mockUsePathname.mockReturnValue('/leads')
    render(<NavItemComponent item={dashboardItem} />)
    const link = screen.getByTestId('sidebar-nav-item-dashboard')
    expect(link).not.toHaveAttribute('aria-current')
  })

  it('marca aria-current quando href operacional usa rota filha', () => {
    mockUsePathname.mockReturnValue('/leads/lead-1')
    const leadsItem: NavItem = { ...dashboardItem, href: '/leads', label: 'Leads', tooltip: 'Leads' }
    render(<NavItemComponent item={leadsItem} />)
    expect(screen.getByTestId('sidebar-nav-item-leads')).toHaveAttribute('aria-current', 'page')
  })

  it('NAO marca /admin como ativo para qualquer subrota admin', () => {
    mockUsePathname.mockReturnValue('/admin/convites')
    const adminItem: NavItem = { ...dashboardItem, href: '/admin', label: 'Admin', tooltip: 'Admin' }
    render(<NavItemComponent item={adminItem} />)
    expect(screen.getByTestId('sidebar-nav-item-admin')).not.toHaveAttribute('aria-current')
  })

  it('NAO marca aria-current para /dashboard quando pathname comeca com /dashboard mas e diferente', () => {
    // /dashboard e exato — prefixo nao conta para evitar false-positive em rotas filhas
    mockUsePathname.mockReturnValue('/dashboard/details')
    render(<NavItemComponent item={dashboardItem} />)
    const link = screen.getByTestId('sidebar-nav-item-dashboard')
    // Convencao: nav-item.tsx exclui /dashboard do match por prefixo
    expect(link).not.toHaveAttribute('aria-current')
  })

  it('exibe label quando NAO collapsed', () => {
    mockUsePathname.mockReturnValue('/dashboard')
    render(<NavItemComponent item={dashboardItem} collapsed={false} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('oculta label quando collapsed', () => {
    mockUsePathname.mockReturnValue('/dashboard')
    render(<NavItemComponent item={dashboardItem} collapsed={true} />)
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('seta title (tooltip) somente quando collapsed', () => {
    mockUsePathname.mockReturnValue('/dashboard')
    const { rerender } = render(<NavItemComponent item={dashboardItem} collapsed={false} />)
    expect(screen.getByTestId('sidebar-nav-item-dashboard')).not.toHaveAttribute('title')
    rerender(<NavItemComponent item={dashboardItem} collapsed={true} />)
    expect(screen.getByTestId('sidebar-nav-item-dashboard')).toHaveAttribute('title', 'Dashboard')
  })

  it('aria-hidden=true no icone decorativo', () => {
    mockUsePathname.mockReturnValue('/dashboard')
    const { container } = render(<NavItemComponent item={dashboardItem} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})
