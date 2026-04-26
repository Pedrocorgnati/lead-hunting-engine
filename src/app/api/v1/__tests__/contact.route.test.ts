/**
 * R-09 intake-review: testes do endpoint /api/v1/contact.
 * Cobre honeypot, same-origin, LGPD 422, fake-200 via time-to-fill.
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    contactMessage: { create: jest.fn() },
  },
}))

const assertRateLimitMock = jest.fn()
const getClientIpMock = jest.fn(() => '1.2.3.4')
jest.mock('@/lib/rate-limiter', () => ({
  assertRateLimit: (...a: unknown[]) => assertRateLimitMock(...a),
  getClientIp: (...a: unknown[]) => getClientIpMock(...a),
}))

const notifyAdminsMock = jest.fn(async () => ({ count: 1 }))
jest.mock('@/lib/notifications/admin-broadcast', () => ({
  notifyAdmins: (...a: unknown[]) => notifyAdminsMock(...a),
}))

import { NextRequest } from 'next/server'
import { POST } from '../contact/route'
import { prisma } from '@/lib/prisma'

const create = prisma.contactMessage.create as jest.MockedFunction<
  typeof prisma.contactMessage.create
>

function mkReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const defaultHeaders: Record<string, string> = {
    'content-type': 'application/json',
    origin: 'http://localhost:3000',
    host: 'localhost:3000',
    ...headers,
  }
  return new NextRequest(new URL('http://localhost:3000/api/v1/contact'), {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(body),
  })
}

const validPayload = {
  email: 'client@test.com',
  name: 'Cliente Teste',
  subject: 'Interesse',
  message: 'Gostaria de saber mais',
  consentLgpd: true,
  businessType: 'PME',
}

beforeEach(() => {
  jest.clearAllMocks()
  assertRateLimitMock.mockImplementation(() => undefined)
  create.mockResolvedValue({ id: 'cm-1' } as never)
})

describe('POST /api/v1/contact', () => {
  it('happy path: creates ContactMessage and triggers notifyAdmins', async () => {
    const res = await POST(mkReq(validPayload))
    expect(res.status).toBe(200)
    expect(create).toHaveBeenCalledTimes(1)
    // notifyAdmins e fire-and-forget (void) — pode ou nao ter sido chamado
    // ate o await do response resolver. Esperamos no proximo tick.
    await new Promise((r) => setImmediate(r))
    expect(notifyAdminsMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'CONTACT_MESSAGE_RECEIVED' }),
    )
  })

  it('403 when origin != host (cross-origin attack)', async () => {
    const res = await POST(
      mkReq(validPayload, { origin: 'http://evil.com', host: 'localhost:3000' }),
    )
    expect(res.status).toBe(403)
    expect(create).not.toHaveBeenCalled()
  })

  it('honeypot _gotcha filled -> Zod rejects at validation (400) before handler', async () => {
    // honeypotField e z.string().max(0) — qualquer valor nao-vazio rejeitado
    // pela camada de validacao, nao chega ao handler. Bot receberia 400,
    // nao fake-200, mas nao persiste (comportamento equivalente).
    const res = await POST(mkReq({ ...validPayload, _gotcha: 'bot-fill' }))
    expect(res.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it('time-to-fill < 2000ms -> fake-200 (anti-bot)', async () => {
    const now = Date.now()
    const res = await POST(
      mkReq(validPayload, { 'x-form-started-at': String(now - 500) }),
    )
    const body = await res.json()
    expect(body.data.fake).toBe(true)
    expect(create).not.toHaveBeenCalled()
  })

  it('time-to-fill >= 2000ms -> persists normally', async () => {
    const startedAt = Date.now() - 5000
    const res = await POST(
      mkReq(validPayload, { 'x-form-started-at': String(startedAt) }),
    )
    expect(res.status).toBe(200)
    expect(create).toHaveBeenCalled()
  })

  it('422 when consentLgpd missing (LGPD_CONSENT_REQUIRED)', async () => {
    const res = await POST(
      mkReq({ ...validPayload, consentLgpd: false }),
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('LGPD_CONSENT_REQUIRED')
  })

  it('400 when email invalid (zod)', async () => {
    const res = await POST(mkReq({ ...validPayload, email: 'not-an-email' }))
    expect(res.status).toBe(400)
  })

  it('400 when required field missing', async () => {
    const { message, ...incomplete } = validPayload
    void message
    const res = await POST(mkReq(incomplete))
    expect(res.status).toBe(400)
  })

  it('applies landing rate-limit by IP (5/min)', async () => {
    await POST(mkReq(validPayload))
    expect(assertRateLimitMock).toHaveBeenCalledWith('landing-forms:1.2.3.4', 5)
  })
})
