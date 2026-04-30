import '@testing-library/jest-dom'

// Mock de next/navigation para os tests de Sidebar/Breadcrumbs/NavItem.
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/dashboard'),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
}))

// Mock global do hook useAuth para Sidebar/Header tests.
jest.mock('@/lib/hooks/use-auth', () => ({
  useAuth: jest.fn(() => ({
    user: { id: 'u1', email: 'op@example.com', name: 'Operador', role: 'OPERATOR' },
    isAdmin: false,
    loading: false,
    signOut: jest.fn(),
  })),
}))
