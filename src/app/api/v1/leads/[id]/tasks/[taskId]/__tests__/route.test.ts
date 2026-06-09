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
import { PATCH, DELETE } from '../route'
import { prisma } from '@/lib/prisma'

const leadFind = prisma.lead.findFirst as jest.MockedFunction<typeof prisma.lead.findFirst>
const leadUpdate = prisma.lead.update as jest.MockedFunction<typeof prisma.lead.update>

const ctx = { params: Promise.resolve({ id: 'lead-1', taskId: 'task-1' }) }

function mkPatch(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/leads/lead-1/tasks/task-1'), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mkDelete(): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/leads/lead-1/tasks/task-1'), { method: 'DELETE' })
}

beforeEach(() => {
  jest.clearAllMocks()
  requireAuthMock.mockResolvedValue({ id: 'user-me', role: 'OPERATOR' })
})

describe('PATCH /api/v1/leads/[id]/tasks/[taskId]', () => {
  it('marks task as completed', async () => {
    leadFind.mockResolvedValue({
      id: 'lead-1',
      metadata: {
        leadTasks: [
          {
            id: 'task-1',
            title: 'Ligar',
            dueAt: null,
            completed: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    } as never)
    leadUpdate.mockResolvedValue({ id: 'lead-1' } as never)

    const res = await PATCH(mkPatch({ completed: true }), ctx)
    expect(res.status).toBe(200)
    const updateCall = leadUpdate.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: 'lead-1' })
  })

  it('returns 404 when task does not exist', async () => {
    leadFind.mockResolvedValue({
      id: 'lead-1',
      metadata: { leadTasks: [] },
    } as never)

    const res = await PATCH(mkPatch({ completed: true }), ctx)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/v1/leads/[id]/tasks/[taskId]', () => {
  it('removes an existing task', async () => {
    leadFind.mockResolvedValue({
      id: 'lead-1',
      metadata: {
        leadTasks: [
          {
            id: 'task-1',
            title: 'Ligar',
            dueAt: null,
            completed: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    } as never)
    leadUpdate.mockResolvedValue({ id: 'lead-1' } as never)

    const res = await DELETE(mkDelete(), ctx)
    expect(res.status).toBe(204)
  })

  it('returns 404 when task does not exist', async () => {
    leadFind.mockResolvedValue({ id: 'lead-1', metadata: { leadTasks: [] } } as never)

    const res = await DELETE(mkDelete(), ctx)
    expect(res.status).toBe(404)
  })
})
