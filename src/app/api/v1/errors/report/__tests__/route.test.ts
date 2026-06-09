const assertRateLimitMock = jest.fn()
const getClientIpMock = jest.fn(() => '1.2.3.4')

jest.mock('@/lib/rate-limiter', () => ({
  assertRateLimit: (...a: unknown[]) => (assertRateLimitMock as (...x: unknown[]) => unknown)(...a),
  getClientIp: (...a: unknown[]) => (getClientIpMock as (...x: unknown[]) => unknown)(...a),
  RateLimitError: class RateLimitError extends Error {},
}))

import { NextRequest } from 'next/server'
import { POST } from '../route'

function mkReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL('http://localhost:3000/api/v1/errors/report'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const payload = {
  correlationId: 'err-20260529-abc12345',
  boundary: 'ui.error-boundary',
  pathname: '/erro/500',
  userAgent: 'jest',
  occurredAt: '2026-05-29T12:00:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  assertRateLimitMock.mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('POST /api/v1/errors/report', () => {
  it('aceita report sanitizado e retorna correlationId', async () => {
    const res = await POST(mkReq(payload))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({
      reported: true,
      correlationId: payload.correlationId,
    })
    expect(assertRateLimitMock).toHaveBeenCalledWith('errors-report:1.2.3.4', 20)
    expect(console.error).toHaveBeenCalledWith(
      '[Client Error Report]',
      expect.not.objectContaining({
        message: expect.any(String),
        stack: expect.any(String),
      }),
    )
  })

  it('rejeita stack trace e mensagem tecnica no payload', async () => {
    const res = await POST(
      mkReq({
        ...payload,
        message: 'Database password leaked',
        stack: 'Error: secret\\n at internal',
      }),
    )

    expect(res.status).toBe(400)
  })

  it('bloqueia origem cruzada', async () => {
    const res = await POST(
      mkReq(payload, {
        origin: 'http://evil.example',
        host: 'localhost:3000',
      }),
    )

    expect(res.status).toBe(403)
  })
})
