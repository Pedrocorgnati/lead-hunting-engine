/**
 * R-12 intake-review: testes dos endpoints de SavedView.
 * Cobre CRUD + scope per-user (authz) + upsert por (userId, name).
 */
const requireAuthMock = jest.fn()
jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual<typeof import('@/lib/auth')>('@/lib/auth')
  return {
    ...actual,
    requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  }
})

jest.mock('@/lib/prisma', () => ({
  prisma: {
    savedView: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

import { NextRequest } from 'next/server'
import { GET, POST } from '../route'
import { DELETE } from '../[id]/route'
import { prisma } from '@/lib/prisma'

const findMany = prisma.savedView.findMany as jest.MockedFunction<typeof prisma.savedView.findMany>
const upsert = prisma.savedView.upsert as jest.MockedFunction<typeof prisma.savedView.upsert>
const deleteMany = prisma.savedView.deleteMany as jest.MockedFunction<
  typeof prisma.savedView.deleteMany
>

function mkPost(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/views'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  requireAuthMock.mockResolvedValue({ id: 'user-me', role: 'OPERATOR', email: 'me@test.com' })
})

describe('GET /api/v1/views', () => {
  it('lists only views of the authenticated user', async () => {
    findMany.mockResolvedValue([
      { id: 'v1', name: 'hot', filters: { score: 80 }, createdAt: new Date('2026-04-01Z') },
    ] as never)

    const res = await GET()
    expect(res.status).toBe(200)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-me' } }),
    )
  })
})

describe('POST /api/v1/views', () => {
  it('upsert by (userId, name) — same name for same user overwrites filters', async () => {
    upsert.mockResolvedValue({
      id: 'v-new',
      name: 'hot',
      filters: { score: 90 },
      createdAt: new Date(),
    } as never)

    const res = await POST(mkPost({ name: 'hot', filters: { score: 90 } }))
    expect(res.status).toBe(201)
    const call = upsert.mock.calls[0][0] as {
      where: { userId_name: { userId: string; name: string } }
    }
    expect(call.where.userId_name).toEqual({ userId: 'user-me', name: 'hot' })
  })

  it('rejects name > 120 chars (Zod)', async () => {
    const res = await POST(mkPost({ name: 'x'.repeat(200), filters: {} }))
    expect([400, 422]).toContain(res.status)
  })

  it('rejects missing filters object', async () => {
    const res = await POST(mkPost({ name: 'ok' }))
    expect([400, 422]).toContain(res.status)
  })
})

describe('DELETE /api/v1/views/[id]', () => {
  it('deletes only views belonging to user (authz guard)', async () => {
    deleteMany.mockResolvedValue({ count: 1 } as never)
    const res = await DELETE(
      new NextRequest(new URL('http://localhost/api/v1/views/v1'), { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'v1' }) },
    )
    expect(res.status).toBe(204)
    const call = deleteMany.mock.calls[0][0] as { where: { id: string; userId: string } }
    expect(call.where).toEqual({ id: 'v1', userId: 'user-me' })
  })

  it('returns 404 when view does not belong to user (count=0)', async () => {
    deleteMany.mockResolvedValue({ count: 0 } as never)
    const res = await DELETE(
      new NextRequest(new URL('http://localhost/api/v1/views/other'), { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'other' }) },
    )
    expect(res.status).toBe(404)
  })
})
