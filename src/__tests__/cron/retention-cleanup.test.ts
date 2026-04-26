const mockRunRetentionCleanup = jest.fn()
jest.mock('@/lib/jobs/retention-cleanup', () => ({
  runRetentionCleanup: (...args: unknown[]) => mockRunRetentionCleanup(...args),
}))

const mockCaptureException = jest.fn()
jest.mock('@/lib/observability/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/v1/cron/retention-cleanup/route'

const SECRET = 'test-cron-secret'

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://example.com/api/v1/cron/retention-cleanup', {
    headers,
  }) as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = SECRET
  delete process.env.CRON_SECRET_KEY
})

afterAll(() => {
  delete process.env.CRON_SECRET
})

describe('GET /api/v1/cron/retention-cleanup', () => {
  it('rejeita sem autenticacao com 401', async () => {
    const res = await GET(makeRequest({}))
    expect(res.status).toBe(401)
    expect(mockRunRetentionCleanup).not.toHaveBeenCalled()
  })

  it('rejeita com token errado com 401', async () => {
    const res = await GET(makeRequest({ authorization: 'Bearer wrong' }))
    expect(res.status).toBe(401)
  })

  it('aceita Authorization: Bearer <CRON_SECRET>', async () => {
    mockRunRetentionCleanup.mockResolvedValue({
      deleted: 1,
      rawDeleted: 2,
      executedAt: new Date(),
      durationMs: 10,
    })
    const res = await GET(makeRequest({ authorization: `Bearer ${SECRET}` }))
    expect(res.status).toBe(200)
    expect(mockRunRetentionCleanup).toHaveBeenCalledTimes(1)
  })

  it('aceita x-cron-token (legacy)', async () => {
    mockRunRetentionCleanup.mockResolvedValue({
      deleted: 0,
      rawDeleted: 0,
      executedAt: new Date(),
      durationMs: 1,
    })
    const res = await GET(makeRequest({ 'x-cron-token': SECRET }))
    expect(res.status).toBe(200)
    expect(mockRunRetentionCleanup).toHaveBeenCalledTimes(1)
  })

  it('fallback CRON_SECRET_KEY quando CRON_SECRET ausente', async () => {
    delete process.env.CRON_SECRET
    process.env.CRON_SECRET_KEY = 'legacy-secret'
    mockRunRetentionCleanup.mockResolvedValue({
      deleted: 0,
      rawDeleted: 0,
      executedAt: new Date(),
      durationMs: 1,
    })
    const res = await GET(makeRequest({ authorization: 'Bearer legacy-secret' }))
    expect(res.status).toBe(200)
    delete process.env.CRON_SECRET_KEY
  })

  it('retorna 500 e captura Sentry quando job falha', async () => {
    const boom = new Error('boom')
    mockRunRetentionCleanup.mockRejectedValue(boom)
    const res = await GET(makeRequest({ authorization: `Bearer ${SECRET}` }))
    expect(res.status).toBe(500)
    expect(mockCaptureException).toHaveBeenCalledWith(boom, { job: 'retention-cleanup' })
  })
})
