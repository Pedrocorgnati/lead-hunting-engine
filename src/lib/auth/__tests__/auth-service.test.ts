jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    userProfile: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/constants/errors', () => ({
  errorResponse: jest.fn((err: { code: string }) => ({ error: err })),
  AUTH_001: { code: 'AUTH_001', message: 'Unauthorized' },
  AUTH_004: { code: 'AUTH_004', message: 'Forbidden' },
}))

import { getAuthenticatedUser, requireAuth, requireAdmin, AuthError, handleAuthError } from '..'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>
const mockFindUnique = prisma.userProfile.findUnique as jest.MockedFunction<typeof prisma.userProfile.findUnique>

function setupSupabase(user: { id: string } | null, error: Error | null = null) {
  mockCreateClient.mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error,
      }),
    },
  } as never)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getAuthenticatedUser', () => {
  it('should return user profile when authenticated', async () => {
    const profile = { id: 'user-1', email: 'test@test.com', role: 'OPERATOR' }
    setupSupabase({ id: 'user-1' })
    mockFindUnique.mockResolvedValue(profile as never)

    const result = await getAuthenticatedUser()
    expect(result).toEqual(profile)
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, email: true, role: true },
    })
  })

  it('should return null when supabase returns error', async () => {
    setupSupabase(null, new Error('Session expired'))

    const result = await getAuthenticatedUser()
    expect(result).toBeNull()
  })

  it('should return null when no supabase user', async () => {
    setupSupabase(null)

    const result = await getAuthenticatedUser()
    expect(result).toBeNull()
  })

  it('should return null when profile not found in DB', async () => {
    setupSupabase({ id: 'user-1' })
    mockFindUnique.mockResolvedValue(null)

    const result = await getAuthenticatedUser()
    expect(result).toBeNull()
  })
})

describe('requireAuth', () => {
  it('should return user when authenticated', async () => {
    const profile = { id: 'user-1', email: 'test@test.com', role: 'ADMIN' }
    setupSupabase({ id: 'user-1' })
    mockFindUnique.mockResolvedValue(profile as never)

    const result = await requireAuth()
    expect(result).toEqual(profile)
  })

  it('should throw UNAUTHORIZED when not authenticated', async () => {
    setupSupabase(null)

    await expect(requireAuth()).rejects.toThrow(AuthError)
    await expect(requireAuth()).rejects.toMatchObject({ type: 'UNAUTHORIZED' })
  })
})

describe('requireAdmin', () => {
  it('should return user when role is ADMIN', async () => {
    const profile = { id: 'user-1', email: 'admin@test.com', role: 'ADMIN' }
    setupSupabase({ id: 'user-1' })
    mockFindUnique.mockResolvedValue(profile as never)

    const result = await requireAdmin()
    expect(result).toEqual(profile)
  })

  it('should throw FORBIDDEN when role is not ADMIN', async () => {
    const profile = { id: 'user-1', email: 'op@test.com', role: 'OPERATOR' }
    setupSupabase({ id: 'user-1' })
    mockFindUnique.mockResolvedValue(profile as never)

    await expect(requireAdmin()).rejects.toThrow(AuthError)
    await expect(requireAdmin()).rejects.toMatchObject({ type: 'FORBIDDEN' })
  })

  it('should throw UNAUTHORIZED when not authenticated', async () => {
    setupSupabase(null)

    await expect(requireAdmin()).rejects.toThrow(AuthError)
    await expect(requireAdmin()).rejects.toMatchObject({ type: 'UNAUTHORIZED' })
  })
})

describe('AuthError', () => {
  it('should set type to UNAUTHORIZED', () => {
    const error = new AuthError('UNAUTHORIZED')
    expect(error.type).toBe('UNAUTHORIZED')
    expect(error.message).toBe('Not authenticated')
    expect(error).toBeInstanceOf(Error)
  })

  it('should set type to FORBIDDEN', () => {
    const error = new AuthError('FORBIDDEN')
    expect(error.type).toBe('FORBIDDEN')
    expect(error.message).toBe('Insufficient permissions')
  })
})

describe('handleAuthError', () => {
  it('should return 401 for UNAUTHORIZED', () => {
    const response = handleAuthError(new AuthError('UNAUTHORIZED'))
    expect(response.status).toBe(401)
  })

  it('should return 403 for FORBIDDEN', () => {
    const response = handleAuthError(new AuthError('FORBIDDEN'))
    expect(response.status).toBe(403)
  })

  it('should re-throw non-AuthError', () => {
    expect(() => handleAuthError(new Error('random'))).toThrow('random')
  })
})
