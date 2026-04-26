/**
 * R-14 intake-review: middleware propaga x-correlation-id e aplica
 * MAINTENANCE_MODE corretamente com isencoes (/api/health, /manutencao).
 */
jest.mock('@/lib/supabase/middleware', () => ({
  updateSession: jest.fn(async () => {
    const { NextResponse } = await import('next/server')
    return NextResponse.next()
  }),
}))

import { NextRequest } from 'next/server'
import { middleware } from '../middleware'
import { updateSession } from '@/lib/supabase/middleware'

const updateSessionMock = updateSession as jest.MockedFunction<typeof updateSession>

function mkReq(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: new Headers(headers),
  })
}

beforeEach(() => {
  delete process.env.MAINTENANCE_MODE
  jest.clearAllMocks()
})

describe('middleware — x-correlation-id propagation (R-14)', () => {
  it('injects new correlation-id when absent', async () => {
    const res = await middleware(mkReq('http://localhost:3000/dashboard'))
    const cid = res.headers.get('x-correlation-id')
    expect(cid).toBeTruthy()
    expect(cid?.length).toBeGreaterThan(10)
  })

  it('preserves incoming x-correlation-id when valid', async () => {
    const res = await middleware(
      mkReq('http://localhost:3000/dashboard', { 'x-correlation-id': 'caller-trace-abc' }),
    )
    expect(res.headers.get('x-correlation-id')).toBe('caller-trace-abc')
  })

  it('rejects overlong correlation-id (>100 chars) and generates new one', async () => {
    const overlong = 'x'.repeat(200)
    const res = await middleware(
      mkReq('http://localhost:3000/dashboard', { 'x-correlation-id': overlong }),
    )
    const cid = res.headers.get('x-correlation-id')
    expect(cid).toBeTruthy()
    expect(cid).not.toBe(overlong)
  })
})

describe('middleware — MAINTENANCE_MODE (R-14)', () => {
  it('api request returns 503 JSON with Retry-After when flag ON', async () => {
    process.env.MAINTENANCE_MODE = 'true'
    const res = await middleware(mkReq('http://localhost:3000/api/v1/leads'))
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('300')
    expect(res.headers.get('x-correlation-id')).toBeTruthy()
    expect(updateSessionMock).not.toHaveBeenCalled()
  })

  it('page request rewrites to /manutencao with 503 + Retry-After', async () => {
    process.env.MAINTENANCE_MODE = 'true'
    const res = await middleware(mkReq('http://localhost:3000/dashboard'))
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('300')
    expect(res.headers.get('x-correlation-id')).toBeTruthy()
  })

  it('EXEMPT: /api/health continues to updateSession even when flag ON', async () => {
    process.env.MAINTENANCE_MODE = 'true'
    await middleware(mkReq('http://localhost:3000/api/health'))
    expect(updateSessionMock).toHaveBeenCalled()
  })

  it('EXEMPT: /manutencao itself is not re-rewritten', async () => {
    process.env.MAINTENANCE_MODE = 'true'
    await middleware(mkReq('http://localhost:3000/manutencao'))
    expect(updateSessionMock).toHaveBeenCalled()
  })

  it('when flag is off, delegates to updateSession regardless of path', async () => {
    const res = await middleware(mkReq('http://localhost:3000/leads'))
    expect(updateSessionMock).toHaveBeenCalled()
    expect(res.status).not.toBe(503)
  })

  it('when flag is literally "false", does NOT gate', async () => {
    process.env.MAINTENANCE_MODE = 'false'
    const res = await middleware(mkReq('http://localhost:3000/dashboard'))
    expect(res.status).not.toBe(503)
    expect(updateSessionMock).toHaveBeenCalled()
  })
})
