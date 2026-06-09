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
    lead: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}))

import { NextRequest } from 'next/server'
import { GET, POST } from '../route'
import { prisma } from '@/lib/prisma'

const leadFind = prisma.lead.findFirst as jest.MockedFunction<typeof prisma.lead.findFirst>
const leadUpdate = prisma.lead.update as jest.MockedFunction<typeof prisma.lead.update>

const ctx = { params: Promise.resolve({ id: 'lead-1' }) }

function mkGet(): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/leads/lead-1/tasks'))
}

function mkPost(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/leads/lead-1/tasks'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  requireAuthMock.mockResolvedValue({ id: 'user-me', role: 'OPERATOR' })
})

describe('GET /api/v1/leads/[id]/tasks', () => {
  it('returns 404 when lead is not accessible', async () => {
    leadFind.mockResolvedValue(null)
    const res = await GET(mkGet(), ctx)
    expect(res.status).toBe(404)
  })

  it('loads tasks from metadata and returns as data payload', async () => {
    leadFind.mockResolvedValue({
      id: 'lead-1',
      metadata: { leadTasks: [{ id: 't1', title: 'ligar', completed: false }] },
    } as never)

    const res = await GET(mkGet(), ctx)
    expect(res.status).toBe(200)
  })
})

describe('POST /api/v1/leads/[id]/tasks', () => {
  it('creates a new task when data is valid', async () => {
    leadFind.mockResolvedValue({
      id: 'lead-1',
      metadata: { leadTasks: [] },
    } as never)
    leadUpdate.mockResolvedValue({ id: 'lead-1' } as never)

    const res = await POST(mkPost({ title: 'Ligar com lead', dueAt: '2026-12-31' }), ctx)
    expect(res.status).toBe(201)
    expect(leadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            leadTasks: expect.arrayContaining([
              expect.objectContaining({
                title: 'Ligar com lead',
                completed: false,
                dueAt: expect.any(String),
              }),
            ]),
          }),
        }),
      }),
    )
  })

  it('returns error when dueAt is invalid', async () => {
    leadFind.mockResolvedValue({ id: 'lead-1', metadata: { leadTasks: [] } } as never)

    const res = await POST(mkPost({ title: 'Teste', dueAt: 'nao-e-data' }), ctx)
    expect([400, 422]).toContain(res.status)
  })
})
