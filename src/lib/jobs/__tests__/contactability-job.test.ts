/**
 * Testes do job de contatabilidade (Task 7 / criterios 22-26 do doc da feature
 * blacksmith 06-11). Mock do prisma injetado + mock do lead.service: a query e
 * verificada tanto pelo shape do where quanto por um matcher in-memory que
 * reproduz a semantica dos filtros (incluindo a armadilha do boolean nullable).
 */

const mockUpdateStatus = jest.fn()
jest.mock('@/services/lead.service', () => ({
  leadService: {
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
  },
}))

import type { PrismaClient } from '@prisma/client'
import {
  runContactabilityJob,
  measureRequalificationRate,
  NO_CONTACT_REASON,
  RETENTION_KEEP_VALUE,
} from '../contactability-job'

// ─── fixtures e matcher in-memory ───────────────────────────────────────────

interface FixtureLead {
  id: string
  userId: string
  businessName: string
  niche: string | null
  status: string
  email: string | null
  phone: string | null
  phoneNormalized: string | null
  website: string | null
  instagramHandle: string | null
  facebookUrl: string | null
  isWhatsappChannel: boolean | null
  enrichmentData: unknown
  /** Raws vinculadas (criterio 23) — a primeira define a fonte do lead. */
  rawLeadData: { source: string }[]
  createdAt: Date
}

/** Marcador valido de descoberta concluida (DEC-MARCADOR-DESCOBERTA default). */
const MARKER = {
  contactDiscovery: {
    completedAt: '2026-06-11T00:00:00.000Z',
    steps: ['enrichment_pipeline'],
    version: 1,
  },
}

function whatsappBlock(level: 'confirmed' | 'probable' | 'unknown') {
  return {
    whatsapp: {
      level,
      confidence: level === 'confirmed' ? 0.9 : 0,
      evidence: level === 'confirmed' ? ['wa.me-link'] : [],
      number: null,
      numberDivergesFromPhone: null,
      source: level === 'confirmed' ? 'site_html' : 'phone_classifier',
      detectedAt: '2026-06-11T00:00:00.000Z',
    },
  }
}

let seq = 0
function makeLead(overrides: Partial<FixtureLead> = {}): FixtureLead {
  seq++
  return {
    id: `lead-${seq}`,
    userId: 'user-1',
    businessName: `Negocio ${seq}`,
    niche: null,
    status: 'NEW',
    email: null,
    phone: null,
    phoneNormalized: null,
    website: null,
    instagramHandle: null,
    facebookUrl: null,
    isWhatsappChannel: null,
    enrichmentData: { ...MARKER },
    rawLeadData: [],
    createdAt: new Date(Date.parse('2026-06-01T00:00:00Z') + seq * 1000),
    ...overrides,
  }
}

const NULLABLE_FIELDS = ['email', 'phone', 'phoneNormalized', 'website', 'instagramHandle', 'facebookUrl'] as const

/**
 * Reproduz a semantica do where montado pelo job: igualdade direta para os
 * campos nulaveis, status estrito e OR explicito para isWhatsappChannel
 * (null OU false) — exatamente o contrato que o Prisma executaria.
 */
function applyWhere(store: FixtureLead[], where: Record<string, unknown>): FixtureLead[] {
  return store.filter((lead) => {
    if ('status' in where && lead.status !== where.status) return false
    for (const field of NULLABLE_FIELDS) {
      if (field in where && lead[field] !== where[field]) return false
    }
    if (Array.isArray(where.OR)) {
      const matchesOr = (where.OR as Record<string, unknown>[]).some((clause) =>
        Object.entries(clause).every(
          ([key, value]) => lead[key as keyof FixtureLead] === value,
        ),
      )
      if (!matchesOr) return false
    }
    if ('userId' in where && lead.userId !== where.userId) return false
    if ('niche' in where && lead.niche !== where.niche) return false
    return true
  })
}

function makePrismaMock(store: FixtureLead[]) {
  return {
    lead: {
      findMany: jest.fn(
        async (args: { where: Record<string, unknown>; take?: number }) =>
          applyWhere(store, args.where)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .slice(0, args.take ?? 100)
            .map((lead) => ({
              id: lead.id,
              userId: lead.userId,
              businessName: lead.businessName,
              niche: lead.niche,
              enrichmentData: lead.enrichmentData,
              // Reproduz o take: 1 do select aninhado (criterio 23).
              rawLeadData: lead.rawLeadData.slice(0, 1).map((raw) => ({ source: raw.source })),
            })),
      ),
      update: jest.fn(async () => ({})),
    },
    leadHistory: {
      // Arg tipado para que mock.calls preserve o shape do payload nas assercoes.
      create: jest.fn(async (args: { data: { field: string; newValue: string } }) => ({ ...args, id: 'hist' })),
      findMany: jest.fn(async () => []),
    },
  }
}

type PrismaMock = ReturnType<typeof makePrismaMock>

function asClient(mock: PrismaMock): PrismaClient {
  return mock as unknown as PrismaClient
}

/** updateStatus que muta o store (simula a transicao real para idempotencia). */
function wireUpdateStatusToStore(store: FixtureLead[]) {
  mockUpdateStatus.mockImplementation(async (leadId: string) => {
    const lead = store.find((l) => l.id === leadId)
    if (!lead) throw new Error('Lead não encontrado.')
    lead.status = 'DISQUALIFIED'
    return lead
  })
}

let errorSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

// ─── runContactabilityJob ───────────────────────────────────────────────────

describe('runContactabilityJob — query (criterio 24)', () => {
  it('monta o where com filtros HARD: status NEW + sem canal + OR do isWhatsappChannel', async () => {
    const prisma = makePrismaMock([])

    await runContactabilityJob({ prisma: asClient(prisma) })

    expect(prisma.lead.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'NEW',
          email: null,
          // R3-2 (emenda §4.8): phone cru tambem precisa ser nulo — lead
          // legado com phone e phoneNormalized null tem canal real.
          phone: null,
          phoneNormalized: null,
          website: null,
          instagramHandle: null,
          facebookUrl: null,
          // Armadilha Prisma: { not: true } excluiria null — o OR cobre os dois.
          OR: [{ isWhatsappChannel: null }, { isWhatsappChannel: false }],
        }),
        orderBy: { createdAt: 'asc' },
        take: 100,
        // Criterio 23: a fonte vem da primeira RawLeadData vinculada.
        select: expect.objectContaining({
          rawLeadData: { select: { source: true }, take: 1 },
        }),
      }),
    )
  })

  it('lead legado com phone preenchido e phoneNormalized null NUNCA entra no lote (R3-2)', async () => {
    const store = [
      makeLead({ id: 'lead-legado-fixo', phone: '(11) 3333-4444', phoneNormalized: null }),
      makeLead({ id: 'lead-sem-canal' }),
    ]
    const prisma = makePrismaMock(store)

    const report = await runContactabilityJob({
      prisma: asClient(prisma),
      apply: true,
      retentionDecision: 'purge-15d',
    })

    expect(report.evaluated).toBe(1)
    expect(report.candidates.map((c) => c.id)).toEqual(['lead-sem-canal'])
    expect(mockUpdateStatus).not.toHaveBeenCalledWith('lead-legado-fixo', 'user-1', expect.anything())
  })

  it('leads ENRICHMENT_PENDING/CONTACTED/NEGOTIATING/CONVERTED/terminais nao sao avaliados', async () => {
    const store = [
      makeLead({ id: 'lead-new' }),
      makeLead({ id: 'lead-pending', status: 'ENRICHMENT_PENDING' }),
      makeLead({ id: 'lead-contacted', status: 'CONTACTED' }),
      makeLead({ id: 'lead-negotiating', status: 'NEGOTIATING' }),
      makeLead({ id: 'lead-converted', status: 'CONVERTED' }),
      makeLead({ id: 'lead-discarded', status: 'DISCARDED' }),
      makeLead({ id: 'lead-false-positive', status: 'FALSE_POSITIVE' }),
      makeLead({ id: 'lead-disqualified', status: 'DISQUALIFIED' }),
    ]
    const prisma = makePrismaMock(store)

    const report = await runContactabilityJob({ prisma: asClient(prisma) })

    expect(report.evaluated).toBe(1)
    expect(report.candidates.map((c) => c.id)).toEqual(['lead-new'])
  })

  it('lead so com Instagram (ou qualquer outro canal) e excluido pela query, nao em pos-processamento', async () => {
    const store = [
      makeLead({ id: 'lead-instagram', instagramHandle: '@pizzaria' }),
      makeLead({ id: 'lead-email', email: 'contato@x.com' }),
      makeLead({ id: 'lead-phone', phoneNormalized: '+5511999999999' }),
      makeLead({ id: 'lead-website', website: 'https://x.com' }),
      makeLead({ id: 'lead-facebook', facebookUrl: 'https://facebook.com/x' }),
      makeLead({ id: 'lead-wa-channel', isWhatsappChannel: true }),
      makeLead({ id: 'lead-sem-canal-null', isWhatsappChannel: null }),
      makeLead({ id: 'lead-sem-canal-false', isWhatsappChannel: false }),
    ]
    const prisma = makePrismaMock(store)

    const report = await runContactabilityJob({ prisma: asClient(prisma) })

    // So os dois sem canal entram; isWhatsappChannel null E false sao avaliados.
    expect(report.evaluated).toBe(2)
    expect(report.candidates.map((c) => c.id).sort()).toEqual([
      'lead-sem-canal-false',
      'lead-sem-canal-null',
    ])
  })

  it('repassa filtros opcionais userId/niche e limit para a query', async () => {
    const prisma = makePrismaMock([])

    await runContactabilityJob({
      prisma: asClient(prisma),
      limit: 7,
      userId: 'user-9',
      niche: 'pizzaria',
    })

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-9', niche: 'pizzaria' }),
        take: 7,
      }),
    )
  })
})

describe('runContactabilityJob — elegibilidade por lead', () => {
  it('sem marcador contactDiscovery => skippedNoMarker (fail-closed, criterio 26)', async () => {
    const store = [
      makeLead({ id: 'lead-sem-marcador', enrichmentData: {} }),
      makeLead({ id: 'lead-marcador-invalido', enrichmentData: { contactDiscovery: { completedAt: '', steps: [] } } }),
      makeLead({ id: 'lead-ok' }),
    ]
    const prisma = makePrismaMock(store)

    const report = await runContactabilityJob({ prisma: asClient(prisma) })

    expect(report.evaluated).toBe(3)
    expect(report.skippedNoMarker).toBe(2)
    expect(report.noContact).toBe(1)
    expect(report.candidates.map((c) => c.id)).toEqual(['lead-ok'])
  })

  it("whatsapp 'probable' SEGURA o lead no funil (skippedHasChannel, nunca desqualifica)", async () => {
    const store = [
      makeLead({ id: 'lead-probable', enrichmentData: { ...MARKER, ...whatsappBlock('probable') } }),
      makeLead({ id: 'lead-confirmed', enrichmentData: { ...MARKER, ...whatsappBlock('confirmed') } }),
      makeLead({ id: 'lead-unknown', enrichmentData: { ...MARKER, ...whatsappBlock('unknown') } }),
    ]
    const prisma = makePrismaMock(store)

    const report = await runContactabilityJob({
      prisma: asClient(prisma),
      apply: true,
      retentionDecision: 'purge-15d',
    })

    expect(report.skippedHasChannel).toBe(2)
    expect(report.noContact).toBe(1)
    expect(report.disqualified).toBe(1)
    // probable/confirmed nunca chegam ao servico de transicao
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1)
    expect(mockUpdateStatus).toHaveBeenCalledWith('lead-unknown', 'user-1', { status: 'DISQUALIFIED' })
  })

  it('quebra noContact por nicho (byNiche, "sem-nicho" quando nulo)', async () => {
    const store = [
      makeLead({ id: 'lead-a', niche: 'pizzaria' }),
      makeLead({ id: 'lead-b', niche: 'pizzaria' }),
      makeLead({ id: 'lead-c', niche: null }),
    ]
    const prisma = makePrismaMock(store)

    const report = await runContactabilityJob({ prisma: asClient(prisma) })

    expect(report.byNiche).toEqual({ pizzaria: 2, 'sem-nicho': 1 })
  })

  it('quebra noContact por fonte (bySource, "sem-fonte" sem raw vinculada — criterio 23)', async () => {
    const store = [
      makeLead({ id: 'lead-gp', rawLeadData: [{ source: 'GOOGLE_PLACES' }] }),
      // Duas raws: so a PRIMEIRA define a fonte do lead.
      makeLead({
        id: 'lead-gp-2',
        rawLeadData: [{ source: 'GOOGLE_PLACES' }, { source: 'INSTAGRAM' }],
      }),
      makeLead({ id: 'lead-sem-raw' }),
    ]
    const prisma = makePrismaMock(store)

    const report = await runContactabilityJob({ prisma: asClient(prisma) })

    expect(report.noContact).toBe(3)
    expect(report.bySource).toEqual({ GOOGLE_PLACES: 2, 'sem-fonte': 1 })
  })
})

describe('runContactabilityJob — dry-run default e gate de apply', () => {
  it('dry-run e o default: nunca transiciona, relatorio marca dryRun', async () => {
    const store = [makeLead({ id: 'lead-a' })]
    const prisma = makePrismaMock(store)

    const report = await runContactabilityJob({ prisma: asClient(prisma) })

    expect(report.dryRun).toBe(true)
    expect(report.noContact).toBe(1)
    expect(report.disqualified).toBe(0)
    expect(report.retentionDecision).toBeNull()
    expect(mockUpdateStatus).not.toHaveBeenCalled()
    expect(prisma.lead.update).not.toHaveBeenCalled()
    expect(prisma.leadHistory.create).not.toHaveBeenCalled()
  })

  it('apply sem retentionDecision lanca erro citando DEC-RETENCAO-DESCARTE', async () => {
    const prisma = makePrismaMock([makeLead()])

    await expect(
      runContactabilityJob({ prisma: asClient(prisma), apply: true }),
    ).rejects.toThrow(/DEC-RETENCAO-DESCARTE/)

    // Falha ANTES de tocar o banco ou o servico.
    expect(prisma.lead.findMany).not.toHaveBeenCalled()
    expect(mockUpdateStatus).not.toHaveBeenCalled()
  })
})

describe('runContactabilityJob — apply', () => {
  it("transiciona EXCLUSIVAMENTE via lead.service com DISQUALIFIED — nunca DISCARDED/FALSE_POSITIVE, nunca update direto de status", async () => {
    const store = [makeLead({ id: 'lead-a' }), makeLead({ id: 'lead-b' })]
    const prisma = makePrismaMock(store)
    wireUpdateStatusToStore(store)

    const report = await runContactabilityJob({
      prisma: asClient(prisma),
      apply: true,
      retentionDecision: 'purge-15d',
    })

    expect(report.disqualified).toBe(2)
    expect(mockUpdateStatus).toHaveBeenCalledTimes(2)
    for (const call of mockUpdateStatus.mock.calls) {
      expect(call[2]).toEqual({ status: 'DISQUALIFIED' })
    }
    // prisma.lead.update nunca e usado para status (purge-15d nao toca retencao)
    expect(prisma.lead.update).not.toHaveBeenCalled()
    // razao registrada em LeadHistory para cada desqualificado
    expect(prisma.leadHistory.create).toHaveBeenCalledTimes(2)
    for (const call of prisma.leadHistory.create.mock.calls) {
      const arg = call[0] as { data: { field: string; newValue: string } }
      expect(arg.data.field).toBe('disqualify_reason')
      expect(arg.data.newValue).toBe(NO_CONTACT_REASON)
    }
  })

  it('falha de transicao (race) loga, conta skippedRace e CONTINUA o lote', async () => {
    const store = [makeLead({ id: 'lead-race' }), makeLead({ id: 'lead-ok' })]
    const prisma = makePrismaMock(store)
    mockUpdateStatus
      .mockRejectedValueOnce(new Error('Transicao invalida: CONTACTED -> DISQUALIFIED.'))
      .mockResolvedValue({})

    const report = await runContactabilityJob({
      prisma: asClient(prisma),
      apply: true,
      retentionDecision: 'purge-15d',
    })

    expect(report.skippedRace).toBe(1)
    expect(report.disqualified).toBe(1)
    expect(mockUpdateStatus).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalled()
    // razao so e registrada para a transicao que deu certo
    expect(prisma.leadHistory.create).toHaveBeenCalledTimes(1)
  })

  it("retentionDecision 'keep' zera retentionUntil apos a transicao e registra retention_policy", async () => {
    const store = [makeLead({ id: 'lead-keep' })]
    const prisma = makePrismaMock(store)
    wireUpdateStatusToStore(store)

    const report = await runContactabilityJob({
      prisma: asClient(prisma),
      apply: true,
      retentionDecision: 'keep',
    })

    expect(report.disqualified).toBe(1)
    expect(report.retentionDecision).toBe('keep')
    expect(prisma.lead.update).toHaveBeenCalledTimes(1)
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-keep' },
      data: { retentionUntil: null },
    })
    expect(prisma.leadHistory.create).toHaveBeenCalledTimes(2)
    const fields = prisma.leadHistory.create.mock.calls.map(
      (call) => (call[0] as { data: { field: string; newValue: string } }).data,
    )
    expect(fields[0]).toEqual(
      expect.objectContaining({ field: 'disqualify_reason', newValue: NO_CONTACT_REASON }),
    )
    expect(fields[1]).toEqual(
      expect.objectContaining({ field: 'retention_policy', newValue: RETENTION_KEEP_VALUE }),
    )
  })

  it("R2-4: falha transitoria do zeramento de retentionUntil e recuperada pelo retry (sem falha no report)", async () => {
    const store = [makeLead({ id: 'lead-keep-retry' })]
    const prisma = makePrismaMock(store)
    wireUpdateStatusToStore(store)
    // 1a tentativa falha, retry resolve (implementacao default do mock).
    prisma.lead.update.mockRejectedValueOnce(new Error('deadlock detected'))

    const report = await runContactabilityJob({
      prisma: asClient(prisma),
      apply: true,
      retentionDecision: 'keep',
    })

    expect(report.disqualified).toBe(1)
    expect(report.retentionOverrideFailures).toBe(0)
    expect(report.retentionOverrideFailedIds).toEqual([])
    expect(prisma.lead.update).toHaveBeenCalledTimes(2)
    // retention_policy registrada normalmente apos o zeramento confirmado
    const fields = prisma.leadHistory.create.mock.calls.map(
      (call) => (call[0] as { data: { field: string } }).data.field,
    )
    expect(fields).toEqual(['disqualify_reason', 'retention_policy'])
  })

  it("R2-4: falha PERSISTENTE no zeramento mantem a transicao, acumula contador e ids no report e o lote continua", async () => {
    const store = [makeLead({ id: 'lead-keep-falha' }), makeLead({ id: 'lead-keep-ok' })]
    const prisma = makePrismaMock(store)
    wireUpdateStatusToStore(store)
    // 3 tentativas do primeiro lead falham; o segundo cai na implementacao
    // default do mock e resolve.
    prisma.lead.update
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'))

    const report = await runContactabilityJob({
      prisma: asClient(prisma),
      apply: true,
      retentionDecision: 'keep',
    })

    // Transicao MANTIDA para os dois — falha de retencao nunca desfaz/aborta.
    expect(report.disqualified).toBe(2)
    expect(store.every((l) => l.status === 'DISQUALIFIED')).toBe(true)
    expect(report.retentionOverrideFailures).toBe(1)
    expect(report.retentionOverrideFailedIds).toEqual(['lead-keep-falha'])
    // 3 tentativas no lead que falhou + 1 sucesso no lead seguinte (lote segue).
    expect(prisma.lead.update).toHaveBeenCalledTimes(4)
    // console.error ALTO citando o leadId e o risco de purge
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('lead-keep-falha'),
      expect.anything(),
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('PURGADO FISICAMENTE'),
      expect.anything(),
    )
    // retention_policy registrada SO para o lead cujo zeramento deu certo
    const retentionPolicyLeads = prisma.leadHistory.create.mock.calls
      .map((call) => (call[0] as unknown as { data: { leadId: string; field: string } }).data)
      .filter((data) => data.field === 'retention_policy')
      .map((data) => data.leadId)
    expect(retentionPolicyLeads).toEqual(['lead-keep-ok'])
  })

  it('idempotencia: segunda execucao consecutiva desqualifica 0 (filtro status NEW)', async () => {
    const store = [makeLead({ id: 'lead-a' }), makeLead({ id: 'lead-b' })]
    const prisma = makePrismaMock(store)
    wireUpdateStatusToStore(store)

    const first = await runContactabilityJob({
      prisma: asClient(prisma),
      apply: true,
      retentionDecision: 'purge-15d',
    })
    expect(first.disqualified).toBe(2)

    const second = await runContactabilityJob({
      prisma: asClient(prisma),
      apply: true,
      retentionDecision: 'purge-15d',
    })
    expect(second.evaluated).toBe(0)
    expect(second.disqualified).toBe(0)
    expect(mockUpdateStatus).toHaveBeenCalledTimes(2)
  })
})

// ─── measureRequalificationRate ─────────────────────────────────────────────

describe('measureRequalificationRate (gate T-08)', () => {
  it('sem desqualificados na janela: zeros e nenhuma segunda query', async () => {
    const prisma = makePrismaMock([])
    prisma.leadHistory.findMany.mockResolvedValueOnce([] as never)

    const result = await measureRequalificationRate(asClient(prisma))

    expect(result).toEqual({ disqualifiedByJob: 0, requalified: 0, ratePct: 0 })
    expect(prisma.leadHistory.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.leadHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          field: 'disqualify_reason',
          newValue: { equals: NO_CONTACT_REASON },
        }),
      }),
    )
  })

  it('cruza disqualify_reason com transicoes status DISQUALIFIED -> NEW posteriores', async () => {
    const prisma = makePrismaMock([])
    const d1 = new Date('2026-06-01T00:00:00Z')
    const d2 = new Date('2026-06-05T00:00:00Z')

    prisma.leadHistory.findMany
      // rows de disqualify_reason (inclui duplicata do lead-a: conta uma vez)
      .mockResolvedValueOnce([
        { leadId: 'lead-a', changedAt: d1 },
        { leadId: 'lead-b', changedAt: d1 },
        { leadId: 'lead-a', changedAt: d2 },
      ] as never)
      // rows de status dos mesmos leads
      .mockResolvedValueOnce([
        { leadId: 'lead-a', oldValue: 'DISQUALIFIED', newValue: 'NEW', changedAt: d2 },
        { leadId: 'lead-b', oldValue: 'NEW', newValue: 'CONTACTED', changedAt: d2 },
      ] as never)

    const result = await measureRequalificationRate(asClient(prisma), { sinceDays: 15 })

    expect(result.disqualifiedByJob).toBe(2)
    expect(result.requalified).toBe(1)
    expect(result.ratePct).toBe(50)
    // segunda query restrita aos leads desqualificados e ao field status
    expect(prisma.leadHistory.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadId: { in: ['lead-a', 'lead-b'] },
          field: 'status',
        }),
      }),
    )
  })
})
