/**
 * R-12 intake-review: testes do endpoint de LeadTag.
 * Cobre authz per-lead + limite 20 chars + upsert idempotente.
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
    lead: { findFirst: jest.fn() },
    leadTag: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

import { NextRequest } from 'next/server'
import { GET, POST, DELETE } from '../[id]/tags/route'
import { prisma } from '@/lib/prisma'

const leadFind = prisma.lead.findFirst as jest.MockedFunction<typeof prisma.lead.findFirst>
const tagFindMany = prisma.leadTag.findMany as jest.MockedFunction<typeof prisma.leadTag.findMany>
const tagUpsert = prisma.leadTag.upsert as jest.MockedFunction<typeof prisma.leadTag.upsert>
const tagDelete = prisma.leadTag.deleteMany as jest.MockedFunction<typeof prisma.leadTag.deleteMany>

const ctx = { params: Promise.resolve({ id: 'lead-1' }) }

function mkGet(): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/leads/lead-1/tags'))
}
function mkPost(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/leads/lead-1/tags'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function mkDelete(label: string): NextRequest {
  return new NextRequest(
    new URL(`http://localhost/api/v1/leads/lead-1/tags?label=${encodeURIComponent(label)}`),
    { method: 'DELETE' },
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  requireAuthMock.mockResolvedValue({ id: 'user-me', role: 'OPERATOR' })
  leadFind.mockResolvedValue({ id: 'lead-1' } as never)
})

describe('GET /api/v1/leads/[id]/tags', () => {
  it('scopes by (leadId, userId) — cross-user leak blocked', async () => {
    tagFindMany.mockResolvedValue([] as never)
    await GET(mkGet(), ctx)
    expect(tagFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leadId: 'lead-1', userId: 'user-me' },
      }),
    )
  })

  it('404 when user has no access to lead (ownership mismatch)', async () => {
    leadFind.mockResolvedValue(null)
    const res = await GET(mkGet(), ctx)
    expect(res.status).toBe(404)
  })

  it('ADMIN bypass ownership check', async () => {
    requireAuthMock.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' })
    tagFindMany.mockResolvedValue([] as never)
    await GET(mkGet(), ctx)
    const call = leadFind.mock.calls[0][0] as { where: { id: string; userId?: string } }
    expect(call.where.userId).toBeUndefined()
  })
})

describe('POST /api/v1/leads/[id]/tags', () => {
  it('upsert idempotente by unique (leadId, userId, label)', async () => {
    tagUpsert.mockResolvedValue({
      id: 't1',
      label: 'quente',
      createdAt: new Date(),
    } as never)
    const res = await POST(mkPost({ label: 'quente' }), ctx)
    expect(res.status).toBe(201)
    const call = tagUpsert.mock.calls[0][0] as {
      where: { leadId_userId_label: { label: string } }
    }
    expect(call.where.leadId_userId_label.label).toBe('quente')
  })

  it('rejects label > 20 chars', async () => {
    const res = await POST(mkPost({ label: 'x'.repeat(30) }), ctx)
    expect([400, 422]).toContain(res.status)
  })

  it('rejects empty label after trim', async () => {
    const res = await POST(mkPost({ label: '   ' }), ctx)
    expect([400, 422]).toContain(res.status)
  })

  it('rejects label with ASCII control characters (tab, newline)', async () => {
    // Regex existente e `[^\x00-\x1f]+` — bloqueia control chars mas permite espacos.
    const res = await POST(mkPost({ label: 'bad\tlabel' }), ctx)
    expect([400, 422]).toContain(res.status)
  })

  it('accepts labels with spaces (intentional for "quente SP" style)', async () => {
    tagUpsert.mockResolvedValue({ id: 'tx', label: 'quente SP', createdAt: new Date() } as never)
    const res = await POST(mkPost({ label: 'quente SP' }), ctx)
    expect(res.status).toBe(201)
  })
})

describe('DELETE /api/v1/leads/[id]/tags', () => {
  it('400 when label query param missing', async () => {
    const res = await DELETE(
      new NextRequest(new URL('http://localhost/api/v1/leads/lead-1/tags')),
      ctx,
    )
    expect(res.status).toBe(400)
  })

  it('204 on successful delete (scoped by user)', async () => {
    tagDelete.mockResolvedValue({ count: 1 } as never)
    const res = await DELETE(mkDelete('quente'), ctx)
    expect(res.status).toBe(204)
    const call = tagDelete.mock.calls[0][0] as {
      where: { leadId: string; userId: string; label: string }
    }
    expect(call.where).toEqual({ leadId: 'lead-1', userId: 'user-me', label: 'quente' })
  })
})
