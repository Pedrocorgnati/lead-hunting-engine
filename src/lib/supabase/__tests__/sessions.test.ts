/**
 * R-01 intake-review: regressao pos-fix de precedencia SQL em listUserSessions.
 * Garante que a query e parenteizada corretamente e que userId e passado como
 * parametro, bloqueando cross-user leak.
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  },
}))

jest.mock('../admin', () => ({
  getSupabaseAdmin: jest.fn(() => ({
    auth: { admin: { getUserById: jest.fn() } },
  })),
}))

import { listUserSessions } from '../sessions'
import { prisma } from '@/lib/prisma'

const queryRaw = prisma.$queryRawUnsafe as jest.MockedFunction<typeof prisma.$queryRawUnsafe>

beforeEach(() => {
  jest.clearAllMocks()
})

describe('listUserSessions — SQL authz regression (R-01)', () => {
  it('passes userId as parameter $1 (prevents injection + scopes to user)', async () => {
    queryRaw.mockResolvedValue([] as never)
    await listUserSessions('user-alpha')
    const [sql, ...args] = queryRaw.mock.calls[0]
    expect(args[0]).toBe('user-alpha')
    expect(sql).toContain('user_id = $1')
  })

  it('wraps OR in parentheses — not_after check cannot bypass user_id filter', async () => {
    queryRaw.mockResolvedValue([] as never)
    await listUserSessions('user-beta')
    const [sql] = queryRaw.mock.calls[0]
    // critico: tem que ter (not_after IS NULL OR not_after > NOW()) parenteizado
    expect(sql).toMatch(/\(\s*not_after IS NULL\s+OR\s+not_after\s*>\s*NOW\(\)\s*\)/)
    // e o AND entre user_id e o grupo deve aparecer antes dos parenteses
    expect(sql).toMatch(/user_id\s*=\s*\$1[^(]*AND\s*\(/s)
  })

  it('maps prisma rows to UserSession shape', async () => {
    queryRaw.mockResolvedValue([
      {
        id: 'sess-1',
        created_at: new Date('2026-04-01T10:00:00Z'),
        updated_at: new Date('2026-04-20T12:00:00Z'),
        user_agent: 'Mozilla/5.0',
        ip: '1.2.3.4',
      },
    ] as never)

    const result = await listUserSessions('user-gamma')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'sess-1',
      createdAt: '2026-04-01T10:00:00.000Z',
      lastActiveAt: '2026-04-20T12:00:00.000Z',
      userAgent: 'Mozilla/5.0',
      ip: '1.2.3.4',
    })
  })

  it('returns [] on DB error (RLS/permission) and logs the reason', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    queryRaw.mockRejectedValue(new Error('permission denied for schema auth'))
    const result = await listUserSessions('user-delta')
    expect(result).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('handles null updated_at without crashing', async () => {
    queryRaw.mockResolvedValue([
      {
        id: 'sess-2',
        created_at: new Date('2026-04-01T10:00:00Z'),
        updated_at: null,
        user_agent: null,
        ip: null,
      },
    ] as never)
    const result = await listUserSessions('user-epsilon')
    expect(result[0].lastActiveAt).toBeNull()
    expect(result[0].userAgent).toBeNull()
    expect(result[0].ip).toBeNull()
  })
})
