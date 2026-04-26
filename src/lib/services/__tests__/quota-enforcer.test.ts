import { CollectionJobStatus } from '@/lib/constants/enums'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    userProfile: { findUnique: jest.fn() },
    collectionJob: { count: jest.fn() },
    lead: { count: jest.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  QuotaEnforcer,
  QuotaExceededError,
  monthStart,
  nextMonthStart,
} from '../quota-enforcer'

const profile = prisma.userProfile as unknown as { findUnique: jest.Mock }
const job = prisma.collectionJob as unknown as { count: jest.Mock }
const lead = prisma.lead as unknown as { count: jest.Mock }

describe('QuotaEnforcer', () => {
  const userId = '22222222-2222-2222-2222-222222222222'
  let enforcer: QuotaEnforcer

  beforeEach(() => {
    enforcer = new QuotaEnforcer()
    jest.clearAllMocks()
  })

  describe('getSnapshot', () => {
    it('usa defaults quando perfil nao existe', async () => {
      profile.findUnique.mockResolvedValue(null)
      job.count.mockResolvedValue(0)
      lead.count.mockResolvedValue(0)

      const snap = await enforcer.getSnapshot(userId)

      expect(snap.monthly).toEqual({
        used: 0,
        max: 500,
        allowed: true,
        resetAt: expect.any(String),
      })
      expect(snap.concurrency).toEqual({ running: 0, max: 3, allowed: true })
      expect(new Date(snap.monthly.resetAt).toISOString()).toBe(snap.monthly.resetAt)
    })

    it('usa valores do perfil quando disponiveis', async () => {
      profile.findUnique.mockResolvedValue({ leadsPerMonthMax: 1000, maxConcurrentJobs: 5 })
      job.count.mockResolvedValue(2)
      lead.count.mockResolvedValue(100)

      const snap = await enforcer.getSnapshot(userId)

      expect(snap.monthly.max).toBe(1000)
      expect(snap.monthly.used).toBe(100)
      expect(snap.concurrency.max).toBe(5)
      expect(snap.concurrency.running).toBe(2)
      expect(snap.monthly.allowed).toBe(true)
      expect(snap.concurrency.allowed).toBe(true)
    })

    it('calcula Lead.count com filtro createdAt >= monthStart', async () => {
      profile.findUnique.mockResolvedValue({ leadsPerMonthMax: 500, maxConcurrentJobs: 3 })
      job.count.mockResolvedValue(0)
      lead.count.mockResolvedValue(42)

      await enforcer.getSnapshot(userId)

      expect(lead.count).toHaveBeenCalledWith({
        where: {
          userId,
          createdAt: { gte: expect.any(Date) },
        },
      })
    })

    it('CollectionJob.count filtra por status PENDING+RUNNING', async () => {
      profile.findUnique.mockResolvedValue({ leadsPerMonthMax: 500, maxConcurrentJobs: 3 })
      job.count.mockResolvedValue(0)
      lead.count.mockResolvedValue(0)

      await enforcer.getSnapshot(userId)

      expect(job.count).toHaveBeenCalledWith({
        where: {
          userId,
          status: { in: [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING] },
        },
      })
    })
  })

  describe('assertCanCreateJob', () => {
    beforeEach(() => {
      profile.findUnique.mockResolvedValue({ leadsPerMonthMax: 10, maxConcurrentJobs: 2 })
    })

    it('nao lanca quando dentro de ambos os limites', async () => {
      job.count.mockResolvedValue(1)
      lead.count.mockResolvedValue(5)
      await expect(enforcer.assertCanCreateJob(userId)).resolves.toBeUndefined()
    })

    it('lanca QuotaExceededError(concurrent) com code JOB_050 e http 429', async () => {
      job.count.mockResolvedValue(2)
      lead.count.mockResolvedValue(0)

      let error: QuotaExceededError | null = null
      try {
        await enforcer.assertCanCreateJob(userId)
      } catch (e) {
        error = e as QuotaExceededError
      }
      expect(error).toBeInstanceOf(QuotaExceededError)
      expect(error!.reason).toBe('concurrent')
      expect(error!.code).toBe('JOB_050')
      expect(error!.httpStatus).toBe(429)
      expect(error!.details).toEqual({ running: 2, max: 2 })
    })

    it('lanca QuotaExceededError(monthly) com code JOB_053 e http 429', async () => {
      job.count.mockResolvedValue(0)
      lead.count.mockResolvedValue(10)

      let error: QuotaExceededError | null = null
      try {
        await enforcer.assertCanCreateJob(userId)
      } catch (e) {
        error = e as QuotaExceededError
      }
      expect(error).toBeInstanceOf(QuotaExceededError)
      expect(error!.reason).toBe('monthly')
      expect(error!.code).toBe('JOB_053')
      expect(error!.httpStatus).toBe(429)
      expect(error!.details).toEqual({ used: 10, max: 10 })
    })

    it('prioriza concurrent sobre monthly quando ambos excedidos', async () => {
      job.count.mockResolvedValue(2)
      lead.count.mockResolvedValue(10)

      await expect(enforcer.assertCanCreateJob(userId)).rejects.toMatchObject({
        reason: 'concurrent',
      })
    })

    it('bloqueia exatamente no limite (N+1 cenario)', async () => {
      job.count.mockResolvedValue(2)
      lead.count.mockResolvedValue(0)

      await expect(enforcer.assertCanCreateJob(userId)).rejects.toBeInstanceOf(QuotaExceededError)
    })
  })

  describe('date helpers', () => {
    it('monthStart zera dia/hora em UTC', () => {
      const d = monthStart(new Date('2026-04-21T15:30:00Z'))
      expect(d.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    })

    it('nextMonthStart avanca um mes', () => {
      const d = nextMonthStart(new Date('2026-04-21T15:30:00Z'))
      expect(d.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    })

    it('nextMonthStart vira para janeiro no fim do ano', () => {
      const d = nextMonthStart(new Date('2026-12-10T00:00:00Z'))
      expect(d.toISOString()).toBe('2027-01-01T00:00:00.000Z')
    })
  })
})
