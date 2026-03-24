/**
 * Helpers de autenticação para testes de integração.
 *
 * Estratégia: mock de @/lib/auth para injetar identidade de teste conhecida
 * (IDs do test seed). A query layer (Prisma + DB) roda sem mock.
 *
 * Os IDs injetados correspondem a registros reais em UserProfile (test seed):
 *   ADMIN    = 00000000-0000-0000-0000-000000000010
 *   OPERATOR = 00000000-0000-0000-0000-000000000011
 */
import { TEST_IDS } from '../../../prisma/seed/test'

export type TestRole = 'ADMIN' | 'OPERATOR'

export interface TestAuthUser {
  id: string
  email: string
  role: TestRole
}

export const TEST_USERS: Record<TestRole, TestAuthUser> = {
  ADMIN: {
    id: TEST_IDS.ADMIN,
    email: 'admin@test.local',
    role: 'ADMIN',
  },
  OPERATOR: {
    id: TEST_IDS.OPERATOR,
    email: 'operator@test.local',
    role: 'OPERATOR',
  },
}

/**
 * Configura o mock de requireAuth para retornar o usuário de teste.
 * Deve ser chamado dentro de beforeEach ou no início de cada teste.
 *
 * Uso:
 *   jest.mock('@/lib/auth')
 *   const { requireAuth } = require('@/lib/auth')
 *   setupAuthMock(requireAuth, 'OPERATOR')
 */
export function setupAuthMock(
  requireAuthMock: jest.Mock,
  role: TestRole = 'OPERATOR',
): void {
  requireAuthMock.mockResolvedValue(TEST_USERS[role])
}

/**
 * Configura mock de requireAdmin para ADMIN válido.
 */
export function setupAdminMock(
  requireAdminMock: jest.Mock,
  role: TestRole = 'ADMIN',
): void {
  if (role === 'ADMIN') {
    requireAdminMock.mockResolvedValue(TEST_USERS.ADMIN)
  } else {
    // Simula erro 403 para não-admin
    const { AuthError } = jest.requireActual('@/lib/auth') as { AuthError: new (type: string) => Error }
    requireAdminMock.mockRejectedValue(new AuthError('FORBIDDEN'))
  }
}

/**
 * Configura mocks para simular request sem autenticação (401).
 */
export function setupUnauthenticatedMock(requireAuthMock: jest.Mock): void {
  const { AuthError } = jest.requireActual('@/lib/auth') as { AuthError: new (type: string) => Error }
  requireAuthMock.mockRejectedValue(new AuthError('UNAUTHORIZED'))
}
