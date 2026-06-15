/**
 * TASK-9 ST002 — unit tests do orquestrador `runCollection`.
 *
 * Cobertura:
 * - Lifecycle PENDING -> RUNNING -> COMPLETED
 * - Clamp MAX_COLLECTION_SIZE = 500 quando maxResults > 500
 * - processedLeads atualizado a cada 10 leads
 * - currentSource muda quando provider cascata
 * - FAILED quando searchBusinesses throw permanente
 * - Upsert por externalId (sem duplicatas)
 * - sanitizeRawJson chamado antes de persistir
 *
 * Estrategia: mock @trigger.dev/sdk/v3 para evitar carregamento de runtime + injetar
 * deps completos via runCollection(payload, deps).
 */

jest.mock('@trigger.dev/sdk/v3', () => ({
  task: (config: unknown) => config,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

import { runCollection, type CollectLeadsDeps, type CollectLeadsPayload } from '../collect-leads'
import { CollectionJobStatus } from '@/lib/constants/enums'

type CollectionJobUpdateCall = { where: { id: string }; data: Record<string, unknown> }
type CollectionJobUpdateManyCall = { where: Record<string, unknown>; data: Record<string, unknown> }
type RawLeadUpsertCall = { where: { externalId: string }; create: Record<string, unknown>; update: Record<string, unknown> }
type RawLeadUpdateManyCall = { where: Record<string, unknown>; data: Record<string, unknown> }

interface PrismaSpy {
  collectionJob: {
    findUniqueOrThrow: jest.Mock
    findUnique: jest.Mock
    update: jest.Mock
    updateMany: jest.Mock
    updateCalls: CollectionJobUpdateCall[]
    updateManyCalls: CollectionJobUpdateManyCall[]
  }
  rawLeadData: {
    upsert: jest.Mock
    updateMany: jest.Mock
    upsertCalls: RawLeadUpsertCall[]
    updateManyCalls: RawLeadUpdateManyCall[]
  }
}

interface MakePrismaOpts {
  /**
   * Status retornado por findUnique nas checagens periodicas de cancelamento.
   * Default: RUNNING (todas as checagens retornam RUNNING).
   * Pode ser uma sequencia para simular transicao mid-loop.
   */
  cancelStatusSequence?: CollectionJobStatus[]
  /** Numero de leads a herdar do parent quando rawLeadData.updateMany e chamado. */
  inheritedCount?: number
  /** Numero de jobs atualizados pelo updateMany final (controla COMPLETED transition). */
  finalTransitionCount?: number
}

function makePrismaSpy(
  userId = 'user-1',
  jobName: string | null = 'Coleta Teste',
  opts: MakePrismaOpts = {},
): PrismaSpy {
  const updateCalls: CollectionJobUpdateCall[] = []
  const updateManyCalls: CollectionJobUpdateManyCall[] = []
  const upsertCalls: RawLeadUpsertCall[] = []
  const updateManyRawCalls: RawLeadUpdateManyCall[] = []

  const cancelSequence = opts.cancelStatusSequence ?? []
  let cancelCallIdx = 0

  return {
    collectionJob: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ userId, name: jobName }),
      findUnique: jest.fn((args?: { select?: Record<string, boolean> }) => {
        // P-07: o fetch inicial do job (select userId/name) agora usa findUnique;
        // as checagens periodicas de cancelamento usam select status.
        if (args?.select?.userId || args?.select?.name) {
          return Promise.resolve({ userId, name: jobName })
        }
        const status = cancelSequence[cancelCallIdx] ?? CollectionJobStatus.RUNNING
        cancelCallIdx++
        return Promise.resolve({ status })
      }),
      update: jest.fn((args: CollectionJobUpdateCall) => {
        updateCalls.push(args)
        return Promise.resolve({})
      }),
      updateMany: jest.fn((args: CollectionJobUpdateManyCall) => {
        updateManyCalls.push(args)
        return Promise.resolve({ count: opts.finalTransitionCount ?? 1 })
      }),
      updateCalls,
      updateManyCalls,
    },
    rawLeadData: {
      upsert: jest.fn((args: RawLeadUpsertCall) => {
        upsertCalls.push(args)
        return Promise.resolve({})
      }),
      updateMany: jest.fn((args: RawLeadUpdateManyCall) => {
        updateManyRawCalls.push(args)
        return Promise.resolve({ count: opts.inheritedCount ?? 0 })
      }),
      upsertCalls,
      updateManyCalls: updateManyRawCalls,
    },
  }
}

function makeBusiness(overrides: Record<string, unknown> = {}) {
  return {
    externalId: 'gp:abc-1',
    source: 'google-places',
    name: 'Pizzaria Teste',
    address: 'Rua A, 123',
    city: 'Sao Paulo',
    state: 'SP',
    phone: '11999998888',
    website: 'https://exemplo.com',
    category: 'pizzaria',
    rating: 4.5,
    reviewCount: 10,
    lat: -23.55,
    lng: -46.63,
    rawJson: { raw: 'data' },
    ...overrides,
  }
}

function makeDeps(prismaSpy: PrismaSpy, overrides: Partial<CollectLeadsDeps> = {}): CollectLeadsDeps {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: prismaSpy as any,
    searchBusinesses: jest.fn().mockResolvedValue([]),
    geocodeAddress: jest.fn().mockResolvedValue(null),
    analyzeSite: jest.fn().mockResolvedValue({
      reachable: true,
      hasSsl: true,
      title: 'Site',
      mobileFriendly: true,
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    normalizeRawLead: jest.fn((b: any) => b) as unknown as CollectLeadsDeps['normalizeRawLead'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sanitizeRawJson: jest.fn((j: any) => j) as unknown as CollectLeadsDeps['sanitizeRawJson'],
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides,
  }
}

const basePayload: CollectLeadsPayload = {
  jobId: 'job-1',
  query: 'pizzaria',
  location: 'Sao Paulo, SP',
  maxResults: 50,
}

describe('runCollection — lifecycle PENDING -> RUNNING -> COMPLETED', () => {
  it('marca job como RUNNING no inicio e COMPLETED no final', async () => {
    const prismaSpy = makePrismaSpy()
    const businesses = [makeBusiness({ externalId: 'gp:1' }), makeBusiness({ externalId: 'gp:2' })]
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
    })

    await runCollection(basePayload, deps)

    // RUNNING vai por update; COMPLETED vai por updateMany (filtro status=RUNNING)
    const initialStatus = prismaSpy.collectionJob.updateCalls
      .map((c) => c.data.status)
      .filter(Boolean)[0]
    expect(initialStatus).toBe(CollectionJobStatus.RUNNING)

    const finalTransition = prismaSpy.collectionJob.updateManyCalls.find(
      (c) => c.data.status === CollectionJobStatus.COMPLETED,
    )
    expect(finalTransition).toBeDefined()
    expect(finalTransition?.where).toEqual({ id: 'job-1', status: CollectionJobStatus.RUNNING })
  })

  it('triggerRunId e gravado quando deps.triggerRunId fornecido', async () => {
    const prismaSpy = makePrismaSpy()
    const deps = makeDeps(prismaSpy, { triggerRunId: 'run_xyz' })

    await runCollection(basePayload, deps)

    const firstUpdate = prismaSpy.collectionJob.updateCalls[0]
    expect(firstUpdate.data.triggerId).toBe('run_xyz')
  })
})

describe('runCollection — clamp MAX_COLLECTION_SIZE', () => {
  it('clamp em 500 quando maxResults = 1000', async () => {
    const prismaSpy = makePrismaSpy()
    const searchBusinesses = jest.fn().mockResolvedValue([])
    const deps = makeDeps(prismaSpy, { searchBusinesses })

    await runCollection({ ...basePayload, maxResults: 1000 }, deps)

    expect(searchBusinesses).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 500 }), expect.anything())
  })

  it('respeita maxResults menor quando ja abaixo do limite', async () => {
    const prismaSpy = makePrismaSpy()
    const searchBusinesses = jest.fn().mockResolvedValue([])
    const deps = makeDeps(prismaSpy, { searchBusinesses })

    await runCollection({ ...basePayload, maxResults: 50 }, deps)

    expect(searchBusinesses).toHaveBeenCalledWith(expect.objectContaining({ maxResults: 50 }), expect.anything())
  })
})

describe('runCollection — processedLeads atualizado a cada 10 leads', () => {
  it('emite update de progresso quando processed % 10 === 0', async () => {
    const prismaSpy = makePrismaSpy()
    const businesses = Array.from({ length: 25 }, (_, i) =>
      makeBusiness({ externalId: `gp:${i}` })
    )
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
    })

    await runCollection(basePayload, deps)

    const progressUpdates = prismaSpy.collectionJob.updateCalls.filter((c) =>
      Object.prototype.hasOwnProperty.call(c.data, 'processedLeads')
    )

    // Esperado: updates em processed=10, 20 (incrementais) + final em COMPLETED (=25)
    const intermediateLeads = progressUpdates
      .filter((c) => c.data.status !== CollectionJobStatus.COMPLETED)
      .map((c) => c.data.processedLeads)

    expect(intermediateLeads).toEqual([10, 20])
  })
})

describe('runCollection — currentSource muda quando provider cascata', () => {
  it('atualiza currentSource quando source do business muda', async () => {
    const prismaSpy = makePrismaSpy()
    const businesses = [
      makeBusiness({ externalId: 'gp:1', source: 'google-places' }),
      makeBusiness({ externalId: 'os:1', source: 'outscraper' }),
    ]
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
    })

    await runCollection(basePayload, deps)

    const sourceUpdates = prismaSpy.collectionJob.updateCalls
      .map((c) => c.data.currentSource)
      .filter((v) => v !== undefined)

    // Sequence (em update normal): 'google-places' (initial), 'outscraper' (mid-batch).
    expect(sourceUpdates).toContain('google-places')
    expect(sourceUpdates).toContain('outscraper')

    // currentSource = null faz parte do updateMany final (COMPLETED).
    const finalTransition = prismaSpy.collectionJob.updateManyCalls.find(
      (c) => c.data.status === CollectionJobStatus.COMPLETED,
    )
    expect(finalTransition?.data.currentSource).toBeNull()
  })
})

describe('runCollection — FAILED quando searchBusinesses throw', () => {
  it('marca job como FAILED com errorMessage e propaga erro', async () => {
    const prismaSpy = makePrismaSpy()
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockRejectedValue(new Error('all providers exhausted')),
    })

    await expect(runCollection(basePayload, deps)).rejects.toThrow('all providers exhausted')

    // FAILED transition usa updateMany com filtro status=RUNNING para nao
    // sobrescrever um eventual CANCELLED concorrente.
    const failedTransition = prismaSpy.collectionJob.updateManyCalls.find(
      (c) => c.data.status === CollectionJobStatus.FAILED,
    )
    expect(failedTransition).toBeDefined()
    expect(failedTransition?.data.errorMessage).toBe('all providers exhausted')
    expect(failedTransition?.where).toEqual({ id: 'job-1', status: CollectionJobStatus.RUNNING })
  })
})

describe('runCollection — upsert por externalId', () => {
  it('chama prisma.rawLeadData.upsert com chave externalId e update vazio', async () => {
    const prismaSpy = makePrismaSpy()
    const businesses = [
      makeBusiness({ externalId: 'gp:abc' }),
      makeBusiness({ externalId: 'gp:xyz' }),
    ]
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
    })

    await runCollection(basePayload, deps)

    expect(prismaSpy.rawLeadData.upsert).toHaveBeenCalledTimes(2)
    expect(prismaSpy.rawLeadData.upsertCalls[0].where).toEqual({ externalId: 'gp:abc' })
    expect(prismaSpy.rawLeadData.upsertCalls[0].update).toEqual({})
  })
})

describe('runCollection — dispatch de notificacoes JOB_COMPLETED / JOB_FAILED', () => {
  it('chama dispatcher.dispatch com JOB_COMPLETED quando job conclui com sucesso', async () => {
    const prismaSpy = makePrismaSpy('user-42', 'Pizzarias SP')
    const businesses = [makeBusiness({ externalId: 'gp:1' }), makeBusiness({ externalId: 'gp:2' })]
    const dispatch = jest.fn().mockResolvedValue(undefined)
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
      dispatcher: { dispatch },
    })

    await runCollection({ ...basePayload, jobId: 'job-42' }, deps)

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      event: 'JOB_COMPLETED',
      userId: 'user-42',
      params: expect.objectContaining({
        jobName: 'Pizzarias SP',
        jobId: 'job-42',
        count: 2,
      }),
    })
  })

  it('chama dispatcher.dispatch com JOB_FAILED quando job lanca erro permanente', async () => {
    const prismaSpy = makePrismaSpy('user-77', 'Mercados RJ')
    const dispatch = jest.fn().mockResolvedValue(undefined)
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockRejectedValue(new Error('all providers exhausted')),
      dispatcher: { dispatch },
    })

    await expect(runCollection({ ...basePayload, jobId: 'job-77' }, deps)).rejects.toThrow(
      'all providers exhausted',
    )

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      event: 'JOB_FAILED',
      userId: 'user-77',
      params: expect.objectContaining({
        jobName: 'Mercados RJ',
        jobId: 'job-77',
        reason: 'all providers exhausted',
      }),
    })
  })

  it('falha do dispatcher NAO bloqueia o lifecycle do job (success path)', async () => {
    const prismaSpy = makePrismaSpy()
    const dispatch = jest.fn().mockRejectedValue(new Error('push channel down'))
    const businesses = [makeBusiness({ externalId: 'gp:1' })]
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
      dispatcher: { dispatch },
    })

    await expect(runCollection(basePayload, deps)).resolves.toEqual({
      success: true,
      processed: 1,
      leadsProcessed: 0,
    })
  })

  it('usa "Coleta" como fallback quando job.name e null', async () => {
    const prismaSpy = makePrismaSpy('user-1', null)
    const dispatch = jest.fn().mockResolvedValue(undefined)
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue([]),
      dispatcher: { dispatch },
    })

    await runCollection(basePayload, deps)

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ jobName: 'Coleta' }),
      }),
    )
  })

  it('nao quebra quando dispatcher e omitido (compat com chamadores legados)', async () => {
    const prismaSpy = makePrismaSpy()
    const businesses = [makeBusiness({ externalId: 'gp:1' })]
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
    })

    await expect(runCollection(basePayload, deps)).resolves.toEqual({
      success: true,
      processed: 1,
      leadsProcessed: 0,
    })
  })
})

describe('runCollection — C1: cancelamento detectado durante a execucao', () => {
  it('interrompe loop quando status muda para CANCELLED mid-batch e NAO seta COMPLETED', async () => {
    // Sequencia: 1a checagem RUNNING (continua), 2a checagem CANCELLED (para)
    const prismaSpy = makePrismaSpy('user-1', 'Coleta', {
      cancelStatusSequence: [
        CollectionJobStatus.RUNNING,
        CollectionJobStatus.CANCELLED,
      ],
    })
    const businesses = [
      makeBusiness({ externalId: 'gp:1' }),
      makeBusiness({ externalId: 'gp:2' }),
      makeBusiness({ externalId: 'gp:3' }),
    ]
    const dispatch = jest.fn().mockResolvedValue(undefined)
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
      dispatcher: { dispatch },
    })

    const result = await runCollection(basePayload, deps)

    // Worker retorna sinal de cancelamento, sem throw
    expect(result).toEqual(expect.objectContaining({ cancelled: true, success: false }))

    // NUNCA tenta transicionar para COMPLETED
    const completedTransition = prismaSpy.collectionJob.updateManyCalls.find(
      (c) => c.data.status === CollectionJobStatus.COMPLETED,
    )
    expect(completedTransition).toBeUndefined()

    // NUNCA tenta transicionar para FAILED
    const failedTransition = prismaSpy.collectionJob.updateManyCalls.find(
      (c) => c.data.status === CollectionJobStatus.FAILED,
    )
    expect(failedTransition).toBeUndefined()

    // Cancelamento NAO dispara JOB_FAILED nem JOB_COMPLETED
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('updateMany de COMPLETED usa filtro status=RUNNING (idempotente vs cancel concorrente)', async () => {
    // Simula caso onde job foi cancelado entre a ultima checagem e o update final:
    // todas as checagens retornam RUNNING, mas updateMany retorna count=0
    // (nao houve match porque status ja e CANCELLED no DB).
    const prismaSpy = makePrismaSpy('user-1', 'Coleta', {
      finalTransitionCount: 0,
    })
    const dispatch = jest.fn().mockResolvedValue(undefined)
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue([makeBusiness({ externalId: 'gp:1' })]),
      dispatcher: { dispatch },
    })

    const result = await runCollection(basePayload, deps)

    // Worker reconhece que transicao falhou e retorna cancelled:true
    expect(result).toEqual(expect.objectContaining({ cancelled: true, success: false }))

    // updateMany foi chamado com filtro de seguranca
    const transition = prismaSpy.collectionJob.updateManyCalls.find(
      (c) => c.data.status === CollectionJobStatus.COMPLETED,
    )
    expect(transition?.where).toEqual({ id: 'job-1', status: CollectionJobStatus.RUNNING })

    // Nao dispara JOB_COMPLETED quando transicao foi no-op
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('runCollection — C2: retomada via retriedFromId (checkpointing real)', () => {
  it('herda RawLeadData do parent re-atribuindo jobId quando retriedFromId presente', async () => {
    const prismaSpy = makePrismaSpy('user-7', 'Retry job', { inheritedCount: 5 })
    const businesses = [makeBusiness({ externalId: 'gp:novo' })]
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
    })

    const result = await runCollection(
      { ...basePayload, jobId: 'job-retry', retriedFromId: 'job-parent' },
      deps,
    )

    // rawLeadData.updateMany foi chamado para re-atribuir jobId
    expect(prismaSpy.rawLeadData.updateMany).toHaveBeenCalledWith({
      where: { jobId: 'job-parent', userId: 'user-7' },
      data: { jobId: 'job-retry' },
    })

    // processedLeads inicial reflete leads herdados (5)
    const initialInheritUpdate = prismaSpy.collectionJob.updateCalls.find(
      (c) => c.data.processedLeads === 5,
    )
    expect(initialInheritUpdate).toBeDefined()
    expect(initialInheritUpdate?.data.resultCount).toBe(5)

    // Total final = inheritedCount + processed (5 + 1 do business novo) = 6
    expect(result).toEqual({ success: true, processed: 6, leadsProcessed: 0 })

    // totalEstimated reflete soma (businesses.length=1 + inherited=5 = 6)
    const totalEstimatedUpdate = prismaSpy.collectionJob.updateCalls.find(
      (c) => c.data.totalEstimated !== undefined,
    )
    expect(totalEstimatedUpdate?.data.totalEstimated).toBe(6)
  })

  it('NAO re-atribui leads quando retriedFromId ausente (caminho normal)', async () => {
    const prismaSpy = makePrismaSpy()
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue([makeBusiness({ externalId: 'gp:1' })]),
    })

    await runCollection(basePayload, deps)

    expect(prismaSpy.rawLeadData.updateMany).not.toHaveBeenCalled()
  })

  it('processed final retornado e (inherited + novos)', async () => {
    const prismaSpy = makePrismaSpy('user-1', 'job', { inheritedCount: 3 })
    const businesses = [
      makeBusiness({ externalId: 'gp:novo-1' }),
      makeBusiness({ externalId: 'gp:novo-2' }),
    ]
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
    })

    const result = await runCollection(
      { ...basePayload, retriedFromId: 'parent' },
      deps,
    )

    expect(result).toEqual({ success: true, processed: 5, leadsProcessed: 0 })
  })
})

describe('runCollection — sanitizeRawJson aplicado antes de persistir', () => {
  it('chama sanitizeRawJson para cada lead antes do upsert', async () => {
    const prismaSpy = makePrismaSpy()
    const businesses = [
      makeBusiness({ externalId: 'gp:1', rawJson: { email: 'leak@x.com' } }),
      makeBusiness({ externalId: 'gp:2', rawJson: { phone: '11999' } }),
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sanitizeRawJson = jest.fn((j: any) => ({ sanitized: true, ...(j as object) })) as unknown as CollectLeadsDeps['sanitizeRawJson']
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
      sanitizeRawJson,
    })

    await runCollection(basePayload, deps)

    expect(sanitizeRawJson).toHaveBeenCalledTimes(2)
    // Verifica que o rawJson persistido vem do sanitizeRawJson, nao do raw original
    expect(prismaSpy.rawLeadData.upsertCalls[0].create.rawJson).toEqual({
      sanitized: true,
      email: 'leak@x.com',
    })
  })
})

describe('runCollection — encadeia process-leads apos a coleta (fix money-path)', () => {
  it('chama processLeads com jobId/userId e retorna leadsProcessed', async () => {
    const prismaSpy = makePrismaSpy()
    const processLeads = jest.fn().mockResolvedValue({ processed: 3, duplicates: 1, errors: 0, total: 4 })
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue([makeBusiness()]),
      processLeads: processLeads as unknown as CollectLeadsDeps['processLeads'],
    })

    const result = await runCollection(basePayload, deps)

    expect(processLeads).toHaveBeenCalledWith(
      { jobId: 'job-1', userId: expect.any(String) },
      expect.objectContaining({ info: expect.any(Function) }),
    )
    expect(result).toEqual({ success: true, processed: 1, leadsProcessed: 3 })
  })

  it('falha do processamento NAO derruba a coleta concluida (raws ficam para retry)', async () => {
    const prismaSpy = makePrismaSpy()
    const processLeads = jest.fn().mockRejectedValue(new Error('enrichment caiu'))
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue([makeBusiness()]),
      processLeads: processLeads as unknown as CollectLeadsDeps['processLeads'],
    })

    const result = await runCollection(basePayload, deps)

    expect(result).toEqual({ success: true, processed: 1, leadsProcessed: 0 })
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('processamento pos-coleta falhou'),
      expect.objectContaining({ jobId: 'job-1' }),
    )
  })
})

describe('runCollection — P-01 enriquecimento Place Details (fetchGmb)', () => {
  function gmbResult(over: Record<string, unknown> = {}) {
    return {
      placeId: 'gp:x', name: 'X', hours: null, photos: null, categories: null,
      phone: '+551231234567', website: 'https://medcenter.com.br',
      rating: null, userRatingsTotal: null, googleMapsUrl: null,
      ...over,
    }
  }

  it('busca website/phone via fetchGmb para lead Google sem site e habilita analyzeSite', async () => {
    const prismaSpy = makePrismaSpy()
    const businesses = [makeBusiness({ externalId: 'gp:no-site', website: null, phone: null })]
    const fetchGmb = jest.fn().mockResolvedValue(gmbResult())
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue(businesses),
      fetchGmb: fetchGmb as unknown as CollectLeadsDeps['fetchGmb'],
    })

    await runCollection(basePayload, deps)

    expect(fetchGmb).toHaveBeenCalledWith('gp:no-site')
    const created = prismaSpy.rawLeadData.upsertCalls[0].create
    expect(created.website).toBe('https://medcenter.com.br')
    expect(created.phone).toBeTruthy()
    // website agora presente -> o bloco analyzeSite (antes morto p/ Google) dispara
    expect(deps.analyzeSite).toHaveBeenCalledWith('https://medcenter.com.br')
  })

  it('NAO chama fetchGmb quando o lead Google ja tem website', async () => {
    const prismaSpy = makePrismaSpy()
    const fetchGmb = jest.fn()
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue([makeBusiness({ externalId: 'gp:has', website: 'https://ja-tem.com' })]),
      fetchGmb: fetchGmb as unknown as CollectLeadsDeps['fetchGmb'],
    })
    await runCollection(basePayload, deps)
    expect(fetchGmb).not.toHaveBeenCalled()
  })

  it('NAO chama fetchGmb para fonte nao-Google', async () => {
    const prismaSpy = makePrismaSpy()
    const fetchGmb = jest.fn()
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue([makeBusiness({ externalId: 'os:1', source: 'outscraper', website: null })]),
      fetchGmb: fetchGmb as unknown as CollectLeadsDeps['fetchGmb'],
    })
    await runCollection(basePayload, deps)
    expect(fetchGmb).not.toHaveBeenCalled()
  })

  it('fetchGmb lancando erro NAO interrompe a coleta (website fica null)', async () => {
    const prismaSpy = makePrismaSpy()
    const fetchGmb = jest.fn().mockRejectedValue(new Error('places down'))
    const deps = makeDeps(prismaSpy, {
      searchBusinesses: jest.fn().mockResolvedValue([makeBusiness({ externalId: 'gp:err', website: null, phone: null })]),
      fetchGmb: fetchGmb as unknown as CollectLeadsDeps['fetchGmb'],
    })
    const result = await runCollection(basePayload, deps)
    expect((result as { success?: boolean }).success).toBe(true)
    expect(prismaSpy.rawLeadData.upsertCalls[0].create.website).toBeNull()
  })
})

describe('runCollection — P-07 CollectionJob ausente (guard anti-zumbi)', () => {
  it('retorna gracioso sem throw e sem transicionar para RUNNING quando o job nao existe', async () => {
    const prismaSpy = makePrismaSpy()
    prismaSpy.collectionJob.findUnique = jest.fn((args?: { select?: Record<string, boolean> }) => {
      if (args?.select?.userId || args?.select?.name) return Promise.resolve(null)
      return Promise.resolve({ status: CollectionJobStatus.RUNNING })
    }) as unknown as PrismaSpy['collectionJob']['findUnique']
    const deps = makeDeps(prismaSpy, { searchBusinesses: jest.fn().mockResolvedValue([]) })

    const result = await runCollection(basePayload, deps)

    expect((result as { missing?: boolean }).missing).toBe(true)
    const markedRunning = prismaSpy.collectionJob.updateCalls.some(
      (c) => c.data.status === CollectionJobStatus.RUNNING,
    )
    expect(markedRunning).toBe(false)
  })
})
