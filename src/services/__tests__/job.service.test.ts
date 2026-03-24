import { JobService } from '../job.service'
import { CollectionJobStatus } from '@/lib/constants/enums'

// Mock prisma antes de qualquer import que use o módulo
jest.mock('@/lib/prisma', () => ({
  prisma: {
    collectionJob: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}))

// Mock trigger.dev
jest.mock('@trigger.dev/sdk/v3', () => ({
  tasks: {
    trigger: jest.fn().mockResolvedValue({ id: 'trigger-run-id' }),
  },
}))

// Importar após os mocks para garantir que o mock está ativo
import { prisma } from '@/lib/prisma'

// Cast explícito para expor métodos jest.fn()
const db = prisma.collectionJob as unknown as {
  findMany: jest.Mock
  findUnique: jest.Mock
  create: jest.Mock
  update: jest.Mock
  count: jest.Mock
}

describe('JobService', () => {
  let service: JobService

  beforeEach(() => {
    service = new JobService()
    jest.clearAllMocks()
  })

  describe('findAllByUser', () => {
    it('deve retornar jobs do usuário ordenados por createdAt desc', async () => {
      const mockJobs = [
        { id: 'job-1', userId: 'user-1', status: CollectionJobStatus.PENDING },
        { id: 'job-2', userId: 'user-1', status: CollectionJobStatus.COMPLETED },
      ]
      db.findMany.mockResolvedValue(mockJobs)

      const result = await service.findAllByUser('user-1')

      expect(db.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      expect(result).toEqual(mockJobs)
    })

    it('deve retornar array vazio se usuário não tem jobs', async () => {
      db.findMany.mockResolvedValue([])

      const result = await service.findAllByUser('user-sem-jobs')

      expect(result).toEqual([])
    })
  })

  describe('create', () => {
    const validInput = {
      city: 'São Paulo',
      state: 'SP',
      niche: 'restaurantes japoneses',
      sources: ['GOOGLE_MAPS' as const],
      limit: 100,
    }

    it('deve criar job com status PENDING e disparar trigger.dev', async () => {
      const mockJob = {
        id: 'new-job-id',
        userId: 'user-1',
        niche: validInput.niche,
        city: validInput.city,
        state: validInput.state,
        country: 'BR',
        sources: validInput.sources,
        limitVal: validInput.limit,
        status: CollectionJobStatus.PENDING,
        name: validInput.niche,
        progress: 0,
        resultCount: 0,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      }
      db.create.mockResolvedValue(mockJob)

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { tasks } = require('@trigger.dev/sdk/v3') as { tasks: { trigger: jest.Mock } }
      const result = await service.create(validInput, 'user-1')

      expect(db.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          niche: validInput.niche,
          city: validInput.city,
          status: CollectionJobStatus.PENDING,
        }),
      })
      expect(tasks.trigger).toHaveBeenCalledWith(
        'collect-leads',
        expect.objectContaining({ jobId: 'new-job-id' })
      )
      expect(result.id).toBe('new-job-id')
    })
  })

  describe('getStatus', () => {
    it('deve retornar status do job se pertence ao usuário', async () => {
      db.findUnique.mockResolvedValue({
        id: 'job-1',
        status: CollectionJobStatus.RUNNING,
        progress: 45,
        resultCount: 22,
        errorMessage: null,
        userId: 'user-1',
      })

      const result = await service.getStatus('job-1', 'user-1')

      expect(result).toEqual({
        id: 'job-1',
        status: CollectionJobStatus.RUNNING,
        progress: 45,
        resultCount: 22,
        errorMessage: null,
      })
    })

    it('deve retornar null para job de outro usuário (IDOR)', async () => {
      db.findUnique.mockResolvedValue({
        id: 'job-1',
        userId: 'outro-user',
        status: CollectionJobStatus.PENDING,
        progress: 0,
        resultCount: 0,
        errorMessage: null,
      })

      const result = await service.getStatus('job-1', 'user-1')

      expect(result).toBeNull()
    })

    it('deve retornar null para job inexistente', async () => {
      db.findUnique.mockResolvedValue(null)

      const result = await service.getStatus('inexistente', 'user-1')

      expect(result).toBeNull()
    })
  })

  describe('cancel', () => {
    it('deve cancelar job PENDING com status CANCELLED', async () => {
      db.findUnique.mockResolvedValue({
        id: 'job-1',
        userId: 'user-1',
        status: CollectionJobStatus.PENDING,
      })
      db.update.mockResolvedValue({})

      await expect(service.cancel('job-1', 'user-1')).resolves.not.toThrow()

      expect(db.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: CollectionJobStatus.CANCELLED,
          completedAt: expect.any(Date),
        }),
      })
    })

    it('deve cancelar job RUNNING', async () => {
      db.findUnique.mockResolvedValue({
        id: 'job-2',
        userId: 'user-1',
        status: CollectionJobStatus.RUNNING,
      })
      db.update.mockResolvedValue({})

      await expect(service.cancel('job-2', 'user-1')).resolves.not.toThrow()
    })

    it('deve lançar erro com code JOB_052 para job COMPLETED', async () => {
      db.findUnique.mockResolvedValue({
        id: 'job-3',
        userId: 'user-1',
        status: CollectionJobStatus.COMPLETED,
      })

      const error = await service.cancel('job-3', 'user-1').catch(e => e)
      expect((error as { code: string }).code).toBe('JOB_052')
      expect((error as { httpStatus: number }).httpStatus).toBe(409)
    })

    it('deve lançar AuthError para job de outro usuário (IDOR)', async () => {
      db.findUnique.mockResolvedValue({
        id: 'job-1',
        userId: 'outro-user',
        status: CollectionJobStatus.PENDING,
      })

      await expect(service.cancel('job-1', 'user-1')).rejects.toThrow()
    })
  })

  describe('countConcurrent', () => {
    it('deve contar jobs PENDING e RUNNING do usuário', async () => {
      db.count.mockResolvedValue(2)

      const result = await service.countConcurrent('user-1')

      expect(db.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          status: { in: [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING] },
        },
      })
      expect(result).toBe(2)
    })

    it('deve retornar 0 quando não há jobs ativos', async () => {
      db.count.mockResolvedValue(0)

      const result = await service.countConcurrent('user-sem-jobs')

      expect(result).toBe(0)
    })
  })
})
