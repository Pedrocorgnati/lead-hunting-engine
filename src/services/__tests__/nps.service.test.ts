import { bucketFor } from '@/lib/schemas/nps'

const mockNpsCreate = jest.fn()
const mockNpsFindFirst = jest.fn()
const mockNpsFindMany = jest.fn()
const mockUserFindUnique = jest.fn()
const mockUserFindMany = jest.fn()
const mockLeadCount = jest.fn()
const mockNotificationCreate = jest.fn()
const mockGetConfig = jest.fn()
const mockAuditLog = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    npsResponse: {
      create: mockNpsCreate,
      findFirst: mockNpsFindFirst,
      findMany: mockNpsFindMany,
    },
    userProfile: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
    },
    lead: { count: mockLeadCount },
    notification: { create: mockNotificationCreate },
  },
}))

jest.mock('@/lib/services/system-config', () => ({
  getConfig: (key: string) => mockGetConfig(key),
}))

jest.mock('@/lib/services/audit-service', () => ({
  AuditService: { log: mockAuditLog },
}))

import { npsService } from '@/services/nps.service'

beforeEach(() => {
  jest.clearAllMocks()
  // Defaults: enabled, cooldown 90d, min_days 7, min_leads 3
  mockGetConfig.mockImplementation((key: string) => {
    const map: Record<string, unknown> = {
      'nps.enabled': { value: true },
      'nps.response_cooldown_days': { value: 90 },
      'nps.min_days_active': { value: 7 },
      'nps.min_leads_collected': { value: 3 },
    }
    return Promise.resolve(map[key])
  })
})

describe('bucketFor', () => {
  it.each([
    [0, 'detractor'],
    [3, 'detractor'],
    [6, 'detractor'],
    [7, 'passive'],
    [8, 'passive'],
    [9, 'promoter'],
    [10, 'promoter'],
  ])('score %i -> %s', (score, bucket) => {
    expect(bucketFor(score)).toBe(bucket)
  })
})

describe('NpsService.getEligibility', () => {
  it('returns disabled when nps.enabled is false', async () => {
    mockGetConfig.mockImplementationOnce(() => Promise.resolve({ value: false }))
    const result = await npsService.getEligibility('user-1')
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('disabled')
  })

  it('returns not_found if user does not exist', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null)
    const result = await npsService.getEligibility('missing')
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('not_found')
  })

  it('returns cooldown when last response is within cooldown window', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      createdAt: new Date(Date.now() - 30 * 86400_000),
    })
    mockNpsFindFirst.mockResolvedValueOnce({
      submittedAt: new Date(Date.now() - 10 * 86400_000),
    })
    const result = await npsService.getEligibility('user-1')
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('cooldown')
    expect(result.cooldownEndsAt).toBeDefined()
  })

  it('returns not_qualified when user is too new and has no leads', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      createdAt: new Date(Date.now() - 2 * 86400_000),
    })
    mockNpsFindFirst.mockResolvedValueOnce(null)
    mockLeadCount.mockResolvedValueOnce(0)
    const result = await npsService.getEligibility('user-1')
    expect(result.eligible).toBe(false)
    expect(result.reason).toBe('not_qualified')
  })

  it('returns eligible when criteria met (days)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      createdAt: new Date(Date.now() - 30 * 86400_000),
    })
    mockNpsFindFirst.mockResolvedValueOnce(null)
    mockLeadCount.mockResolvedValueOnce(0)
    const result = await npsService.getEligibility('user-1')
    expect(result.eligible).toBe(true)
  })

  it('returns eligible when criteria met (leads)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      createdAt: new Date(Date.now() - 1 * 86400_000),
    })
    mockNpsFindFirst.mockResolvedValueOnce(null)
    mockLeadCount.mockResolvedValueOnce(5)
    const result = await npsService.getEligibility('user-1')
    expect(result.eligible).toBe(true)
  })
})

describe('NpsService.submit', () => {
  function setupEligible() {
    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      createdAt: new Date(Date.now() - 30 * 86400_000),
    })
    mockNpsFindFirst.mockResolvedValue(null)
    mockLeadCount.mockResolvedValue(0)
  }

  it('creates response, logs audit, no notification for promoter', async () => {
    setupEligible()
    mockNpsCreate.mockResolvedValueOnce({
      id: 'r1',
      userId: 'user-1',
      score: 9,
      comment: null,
      submittedAt: new Date(),
    })

    await npsService.submit('user-1', { score: 9 })

    expect(mockNpsCreate).toHaveBeenCalledTimes(1)
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'nps.submitted' })
    )
    expect(mockNotificationCreate).not.toHaveBeenCalled()
  })

  it('notifies admins on detractor', async () => {
    setupEligible()
    mockNpsCreate.mockResolvedValueOnce({
      id: 'r2',
      userId: 'user-1',
      score: 3,
      comment: 'rolling',
      submittedAt: new Date(),
    })
    mockUserFindMany.mockResolvedValueOnce([{ id: 'admin-1' }, { id: 'admin-2' }])

    await npsService.submit('user-1', { score: 3, comment: 'rolling' })

    expect(mockNotificationCreate).toHaveBeenCalledTimes(2)
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'NPS_DETRACTOR' }) })
    )
  })

  it('throws NPS_NOT_ELIGIBLE when not eligible', async () => {
    mockGetConfig.mockImplementationOnce(() => Promise.resolve({ value: false }))
    await expect(
      npsService.submit('user-1', { score: 8 })
    ).rejects.toThrow('NPS_NOT_ELIGIBLE')
  })
})
