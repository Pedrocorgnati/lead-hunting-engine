jest.mock('server-only', () => ({}), { virtual: true })
jest.mock('@/lib/prisma', () => ({
  prisma: {
    budgetFlowPush: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    lead: { findMany: jest.fn() },
  },
}))
jest.mock('@/lib/workers/local-queue', () => ({ enqueue: jest.fn().mockResolvedValue({ id: 'q1', created: true }) }))
jest.mock('@/lib/observability/sentry', () => ({ captureException: jest.fn() }))

import {
  normalizeBudget,
  assertLeadsReady,
  BudgetFlowValidationError,
  getBudgetFlowStatus,
} from '../budgetflow-service'
import { runBudgetFlowPush } from '@/lib/workers/budgetflow-push-worker'
import { prisma } from '@/lib/prisma'

const mockPrisma = prisma as unknown as {
  budgetFlowPush: {
    create: jest.Mock
    findFirst: jest.Mock
    findUnique: jest.Mock
    updateMany: jest.Mock
    update: jest.Mock
  }
  lead: { findMany: jest.Mock }
}

beforeEach(() => jest.clearAllMocks())

describe('normalizeBudget', () => {
  it('normaliza formato pt-BR com milhar e decimal', () => {
    expect(normalizeBudget('1.234,56')).toBe(1234.56)
  })

  it('aceita inteiro simples e com prefixo de moeda', () => {
    expect(normalizeBudget('1000')).toBe(1000)
    expect(normalizeBudget('R$ 500,00')).toBe(500)
  })

  it('lanca BUDGET_INVALID para nao-numerico ou zero', () => {
    expect(() => normalizeBudget('abc')).toThrow(BudgetFlowValidationError)
    expect(() => normalizeBudget('0')).toThrow(BudgetFlowValidationError)
  })
})

describe('assertLeadsReady', () => {
  it('passa quando todos os leads pertencem ao usuario', async () => {
    mockPrisma.lead.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    await expect(assertLeadsReady('u1', ['a', 'b'])).resolves.toBeUndefined()
  })

  it('lanca LEADS_NOT_READY (422) quando algum lead falta', async () => {
    mockPrisma.lead.findMany.mockResolvedValue([{ id: 'a' }])
    await expect(assertLeadsReady('u1', ['a', 'b'])).rejects.toMatchObject({
      code: 'LEADS_NOT_READY',
      httpStatus: 422,
    })
  })

  it('nao consulta o banco para lista vazia', async () => {
    await assertLeadsReady('u1', [])
    expect(mockPrisma.lead.findMany).not.toHaveBeenCalled()
  })
})

describe('getBudgetFlowStatus', () => {
  it('retorna null quando push nao pertence ao usuario', async () => {
    mockPrisma.budgetFlowPush.findFirst.mockResolvedValue(null)
    expect(await getBudgetFlowStatus('u1', 'p1')).toBeNull()
  })

  it('mapeia a linha para a view de status', async () => {
    mockPrisma.budgetFlowPush.findFirst.mockResolvedValue({
      id: 'p1', status: 'COMPLETED', delivered: false, deliveryMode: 'manual-download',
      result: { message: 'ok' }, error: null,
      createdAt: new Date('2026-06-09T10:00:00Z'), updatedAt: new Date('2026-06-09T10:00:05Z'),
    })
    const view = await getBudgetFlowStatus('u1', 'p1')
    expect(view).toMatchObject({ jobId: 'p1', status: 'COMPLETED', deliveryMode: 'manual-download' })
  })
})

describe('runBudgetFlowPush (worker)', () => {
  const basePush = {
    id: 'p1', userId: 'u1', campaignId: 'c1', budget: 100, currency: 'BRL',
    note: null, leadIds: [], attempts: 1,
    createdAt: new Date('2026-06-09T10:00:00Z'),
  }

  it('early-return idempotente quando claim falha (ja processado)', async () => {
    mockPrisma.budgetFlowPush.updateMany.mockResolvedValue({ count: 0 })
    await runBudgetFlowPush('p1')
    expect(mockPrisma.budgetFlowPush.findUnique).not.toHaveBeenCalled()
  })

  it('completa com manual-download quando BUDGETFLOW_API_URL ausente', async () => {
    delete process.env.BUDGETFLOW_API_URL
    mockPrisma.budgetFlowPush.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.budgetFlowPush.findUnique.mockResolvedValue(basePush)
    await runBudgetFlowPush('p1')
    expect(mockPrisma.budgetFlowPush.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          delivered: false,
          deliveryMode: 'manual-download',
        }),
      }),
    )
  })

  it('marca FAILED quando leads do push sumiram (readiness re-check)', async () => {
    mockPrisma.budgetFlowPush.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.budgetFlowPush.findUnique.mockResolvedValue({ ...basePush, leadIds: ['x'] })
    mockPrisma.lead.findMany.mockResolvedValue([])
    await runBudgetFlowPush('p1')
    expect(mockPrisma.budgetFlowPush.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    )
  })

  it('terminaliza FAILED apos esgotar tentativas em erro de entrega', async () => {
    process.env.BUDGETFLOW_API_URL = 'https://budgetflow.example/api'
    mockPrisma.budgetFlowPush.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.budgetFlowPush.findUnique.mockResolvedValue({ ...basePush, attempts: 3 })
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('rede caiu'))
    await expect(runBudgetFlowPush('p1')).rejects.toThrow('rede caiu')
    expect(mockPrisma.budgetFlowPush.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', error: 'rede caiu' }) }),
    )
    fetchSpy.mockRestore()
    delete process.env.BUDGETFLOW_API_URL
  })

  it('volta para PENDING (retry via fila) quando ainda ha tentativas', async () => {
    process.env.BUDGETFLOW_API_URL = 'https://budgetflow.example/api'
    mockPrisma.budgetFlowPush.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.budgetFlowPush.findUnique.mockResolvedValue({ ...basePush, attempts: 1 })
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'))
    await expect(runBudgetFlowPush('p1')).rejects.toThrow('timeout')
    expect(mockPrisma.budgetFlowPush.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
    )
    fetchSpy.mockRestore()
    delete process.env.BUDGETFLOW_API_URL
  })
})
