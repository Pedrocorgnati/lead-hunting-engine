const requireAuthMock = jest.fn()
jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual<typeof import('@/lib/auth')>('@/lib/auth')
  return {
    ...actual,
    requireAuth: (...args: unknown[]) => requireAuthMock(...args),
  }
})

const assertRateLimitMock = jest.fn()
jest.mock('@/lib/rate-limiter', () => ({
  assertRateLimit: (...a: unknown[]) => (assertRateLimitMock as (...x: unknown[]) => unknown)(...a),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    waitlistEntry: { findMany: jest.fn() },
    contactMessage: { findMany: jest.fn() },
    landingConsent: { findMany: jest.fn() },
  },
}))

import { NextRequest } from 'next/server'
import { GET } from '../route'
import { prisma } from '@/lib/prisma'

const waitlistFindMany = prisma.waitlistEntry.findMany as jest.MockedFunction<
  typeof prisma.waitlistEntry.findMany
>
const contactFindMany = prisma.contactMessage.findMany as jest.MockedFunction<
  typeof prisma.contactMessage.findMany
>
const consentFindMany = prisma.landingConsent.findMany as jest.MockedFunction<
  typeof prisma.landingConsent.findMany
>

function mkReq(path = '/api/v1/profile/consents/receipt'): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`))
}

beforeEach(() => {
  jest.clearAllMocks()
  requireAuthMock.mockResolvedValue({ id: 'user-1', email: 'user@test.com', role: 'OPERATOR' })
  assertRateLimitMock.mockImplementation(() => undefined)
  waitlistFindMany.mockResolvedValue([] as never)
  contactFindMany.mockResolvedValue([] as never)
  consentFindMany.mockResolvedValue([] as never)
})

describe('GET /api/v1/profile/consents/receipt', () => {
  it('returns the authenticated receipt from a direct consentId link', async () => {
    waitlistFindMany.mockResolvedValue([{ id: 'wl-1', consentId: 'consent-1' }] as never)
    consentFindMany.mockResolvedValue([
      {
        id: 'consent-1',
        version: 'v1',
        categories: ['necessary', 'analytics'],
        acceptedAt: new Date('2026-05-27T12:00:00Z'),
      },
    ] as never)

    const res = await GET(mkReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.receiptId).toBe('consent-1')
    expect(body.data.policyVersion).toBe('v1')
    expect(body.data.acceptedAt).toBe('2026-05-27T12:00:00.000Z')
    expect(body.data.categories).toEqual(['necessary', 'analytics'])
    expect(body.data.hash).toEqual(expect.any(String))
    expect(body.data.downloadUrl).toContain('/api/v1/profile/consents/receipt')
    expect(body.data.downloadToken).toEqual(expect.any(String))
    expect(consentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { id: { in: ['consent-1'] } },
            { waitlistEntryId: { in: ['wl-1'] } },
          ],
        },
      }),
    )
  })

  it('falls back to legacy LandingConsent relation fields when consentId is absent', async () => {
    contactFindMany.mockResolvedValue([{ id: 'cm-1', consentId: null }] as never)
    consentFindMany.mockResolvedValue([
      {
        id: 'consent-legacy',
        version: 'v2',
        categories: ['necessary'],
        acceptedAt: new Date('2026-05-28T10:00:00Z'),
      },
    ] as never)

    const res = await GET(mkReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.receiptId).toBe('consent-legacy')
    expect(consentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ contactMessageId: { in: ['cm-1'] } }],
        },
      }),
    )
  })

  it('returns 404 when the authenticated user has no consent trail', async () => {
    const res = await GET(mkReq())
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error.code).toBe('CONSENT_080')
    expect(consentFindMany).not.toHaveBeenCalled()
  })
})
