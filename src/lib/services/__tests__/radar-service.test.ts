import { CollectionJobStatus, DataSource } from '@/lib/constants/enums'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    collectionJob: {
      groupBy: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    userProfile: {
      findUnique: jest.fn(),
    },
    lead: {
      count: jest.fn(),
    },
  },
}))

jest.mock('@trigger.dev/sdk/v3', () => ({
  tasks: {
    trigger: jest.fn().mockResolvedValue({ id: 'trigger-run-id' }),
  },
}))

import { prisma } from '@/lib/prisma'
import { tasks } from '@trigger.dev/sdk/v3'
import {
  RadarService,
  QuotaExceededError,
  RADAR_JOB_ORIGIN,
  presetKey,
} from '../radar-service'

const job = prisma.collectionJob as unknown as {
  groupBy: jest.Mock
  create: jest.Mock
  count: jest.Mock
}
const profile = prisma.userProfile as unknown as { findUnique: jest.Mock }
const lead = prisma.lead as unknown as { count: jest.Mock }
const trigger = tasks.trigger as unknown as jest.Mock

describe('RadarService', () => {
  const userId = '11111111-1111-1111-1111-111111111111'
  let service: RadarService

  beforeEach(() => {
    service = new RadarService()
    jest.clearAllMocks()
  })

  describe('listPresets', () => {
    it('retorna combinacoes unicas ordenadas por ultima execucao desc', async () => {
      job.groupBy.mockResolvedValue([
        {
          city: 'São Paulo',
          state: 'SP',
          niche: 'restaurante',
          _max: { completedAt: new Date('2026-04-10T00:00:00Z') },
          _sum: { resultCount: 20 },
          _count: { _all: 2 },
        },
        {
          city: 'Rio',
          state: 'RJ',
          niche: 'barbearia',
          _max: { completedAt: new Date('2026-04-20T00:00:00Z') },
          _sum: { resultCount: 15 },
          _count: { _all: 1 },
        },
      ])

      const presets = await service.listPresets(userId)

      expect(presets).toHaveLength(2)
      expect(presets[0].city).toBe('Rio')
      expect(presets[0].leadsCount).toBe(15)
      expect(presets[1].city).toBe('São Paulo')
    })

    it('filtra presets sem leads', async () => {
      job.groupBy.mockResolvedValue([
        {
          city: 'A',
          state: null,
          niche: 'x',
          _max: { completedAt: new Date() },
          _sum: { resultCount: 0 },
          _count: { _all: 1 },
        },
      ])

      const presets = await service.listPresets(userId)
      expect(presets).toHaveLength(0)
    })
  })

  describe('assertQuota', () => {
    it('nao lanca quando dentro dos limites', async () => {
      profile.findUnique.mockResolvedValue({ maxConcurrentJobs: 3, leadsPerMonthMax: 500 })
      job.count.mockResolvedValue(1)
      lead.count.mockResolvedValue(10)

      await expect(service.assertQuota(userId)).resolves.toBeUndefined()
    })

    it('lanca QuotaExceededError(concurrent) quando maxConcurrentJobs atingido', async () => {
      profile.findUnique.mockResolvedValue({ maxConcurrentJobs: 3, leadsPerMonthMax: 500 })
      job.count.mockResolvedValue(3)
      lead.count.mockResolvedValue(0)

      await expect(service.assertQuota(userId)).rejects.toMatchObject({
        name: 'QuotaExceededError',
        reason: 'concurrent',
      })
    })

    it('lanca QuotaExceededError(monthly) quando leadsPerMonthMax atingido', async () => {
      profile.findUnique.mockResolvedValue({ maxConcurrentJobs: 3, leadsPerMonthMax: 100 })
      job.count.mockResolvedValue(0)
      lead.count.mockResolvedValue(100)

      await expect(service.assertQuota(userId)).rejects.toMatchObject({
        name: 'QuotaExceededError',
        reason: 'monthly',
      })
    })
  })

  describe('recollect', () => {
    beforeEach(() => {
      profile.findUnique.mockResolvedValue({ maxConcurrentJobs: 3, leadsPerMonthMax: 500 })
      job.count.mockResolvedValue(0)
      lead.count.mockResolvedValue(0)
      job.create.mockResolvedValue({ id: 'job-new-1' })
    })

    it('cria CollectionJob com metadata.origin=RADAR e enfileira', async () => {
      const result = await service.recollect(userId, {
        city: 'São Paulo',
        state: 'SP',
        niche: 'restaurante',
      })

      expect(result.jobId).toBe('job-new-1')
      expect(job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            city: 'São Paulo',
            state: 'SP',
            niche: 'restaurante',
            status: CollectionJobStatus.PENDING,
            metadata: expect.objectContaining({ origin: RADAR_JOB_ORIGIN }),
          }),
        }),
      )
      expect(trigger).toHaveBeenCalledWith(
        'collect-leads',
        expect.objectContaining({ jobId: 'job-new-1', origin: RADAR_JOB_ORIGIN }),
      )
    })

    it('usa GOOGLE_MAPS como fonte padrao', async () => {
      await service.recollect(userId, { city: 'X', state: null, niche: 'y' })

      expect(job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sources: [DataSource.GOOGLE_MAPS] }),
        }),
      )
    })

    it('bloqueia quando quota concurrent excedida', async () => {
      job.count.mockResolvedValue(5)

      await expect(
        service.recollect(userId, { city: 'X', state: null, niche: 'y' }),
      ).rejects.toBeInstanceOf(QuotaExceededError)
      expect(job.create).not.toHaveBeenCalled()
      expect(trigger).not.toHaveBeenCalled()
    })
  })

  describe('presetKey', () => {
    it('normaliza para lowercase e inclui state vazio quando null', () => {
      expect(presetKey({ city: 'São Paulo', state: 'SP', niche: 'Restaurante' })).toBe(
        'sp|são paulo|restaurante',
      )
      expect(presetKey({ city: 'Rio', state: null, niche: 'X' })).toBe('|rio|x')
    })
  })
})
