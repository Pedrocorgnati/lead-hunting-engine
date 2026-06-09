jest.mock('@/lib/prisma', () => ({
  prisma: {
    landingConsent: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}))

const assertRateLimitMock = jest.fn()
const getClientIpMock = jest.fn(() => '1.2.3.4')
jest.mock('@/lib/rate-limiter', () => ({
  assertRateLimit: (...a: unknown[]) => (assertRateLimitMock as (...x: unknown[]) => unknown)(...a),
  getClientIp: (...a: unknown[]) => (getClientIpMock as (...x: unknown[]) => unknown)(...a),
}))

import { NextRequest } from 'next/server'
import { GET } from '../route'
import { prisma } from '@/lib/prisma'

const findUnique = prisma.landingConsent.findUnique as jest.MockedFunction<
  typeof prisma.landingConsent.findUnique
>
const findFirst = prisma.landingConsent.findFirst as jest.MockedFunction<
  typeof prisma.landingConsent.findFirst
>

function mkReq(path = '/api/v1/consent/receipt'): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`))
}

beforeEach(() => {
  jest.clearAllMocks()
  assertRateLimitMock.mockImplementation(() => undefined)
  findUnique.mockResolvedValue(null)
  findFirst.mockResolvedValue(null)
})

describe('GET /api/v1/consent/receipt', () => {
  it('returns a public receipt by receiptId', async () => {
    findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      version: 'v1',
      categories: ['necessary'],
      acceptedAt: new Date('2026-05-27T12:00:00Z'),
    } as never)

    const res = await GET(
      mkReq('/api/v1/consent/receipt?receiptId=00000000-0000-4000-8000-000000000001'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.receiptId).toBe('00000000-0000-4000-8000-000000000001')
    expect(body.data.policyVersion).toBe('v1')
    expect(body.data.acceptedAt).toBe('2026-05-27T12:00:00.000Z')
    expect(body.data.categories).toEqual(['necessary'])
    expect(body.data.hash).toEqual(expect.any(String))
    expect(body.data.downloadUrl).toContain('/api/v1/consent/receipt')
    expect(body.data.downloadToken).toEqual(expect.any(String))
  })

  it('falls back to the latest consent for the requester ip hash', async () => {
    findFirst.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000002',
      version: 'v2',
      categories: ['necessary', 'analytics'],
      acceptedAt: new Date('2026-05-28T10:00:00Z'),
    } as never)

    const res = await GET(mkReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.receiptId).toBe('00000000-0000-4000-8000-000000000002')
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { acceptedAt: 'desc' },
      }),
    )
  })

  it('returns 404 when no public receipt can be resolved', async () => {
    const res = await GET(mkReq())
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error.code).toBe('CONSENT_080')
  })
})
