/**
 * Testes unit do worker oficial de descoberta de e-mail (W7 da feature
 * 06-11-aumentar-emails-lead-hunting). Sem rede e sem banco: o client Prisma
 * e injetado como fake, `safe-fetch-html` e `ProvenanceService` sao mockados.
 */
jest.mock('@/lib/workers/utils/safe-fetch-html', () => ({
  safeFetchHtml: jest.fn(),
  hostIsSafe: jest.fn(),
}))
jest.mock('@/lib/intelligence/provenance/provenance-service', () => ({
  ProvenanceService: { recordBatch: jest.fn().mockResolvedValue(undefined) },
}))

import type { PrismaClient } from '@prisma/client'
import { runEmailDiscoveryWorker, MAX_PAGES_PER_DOMAIN } from '../email-discovery-worker'
import { safeFetchHtml, hostIsSafe } from '@/lib/workers/utils/safe-fetch-html'
import { ProvenanceService } from '@/lib/intelligence/provenance/provenance-service'
import { CONTACT_DISCOVERY_STEPS } from '@/lib/intelligence/enrichment/enrichment-data'

const safeFetchMock = safeFetchHtml as jest.Mock
const hostIsSafeMock = hostIsSafe as jest.Mock
const recordBatchMock = ProvenanceService.recordBatch as jest.Mock

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HTML_EMAIL_CANONICAL_GENERIC = '<a href="mailto:contato@empresa.com.br">fale conosco</a>'
const HTML_EMAIL_CANONICAL_PERSONAL = '<p>responsavel: joao@empresa.com.br</p>'
const HTML_EMAIL_EXTERNAL = '<footer>site feito por <a href="mailto:contato@plataforma.com">agencia</a></footer>'
const HTML_WA_LINK = '<a href="https://wa.me/5511988887777">chame no whatsapp</a>'
const HTML_SEM_NADA = '<p>bem vindo ao nosso site</p>'

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    website: 'https://empresa.com.br',
    phone: '(11) 99999-8888',
    phoneNormalized: '+5511999998888',
    placeId: 'place-1',
    niche: 'dentista',
    enrichmentData: null,
    ...overrides,
  }
}

function makePrisma(leads: unknown[], updateManyCount = 1) {
  const findMany = jest.fn().mockResolvedValue(leads)
  const updateMany = jest.fn().mockResolvedValue({ count: updateManyCount })
  const update = jest.fn().mockResolvedValue({})
  const prisma = { lead: { findMany, updateMany, update } } as unknown as PrismaClient
  return { prisma, findMany, updateMany, update }
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

beforeEach(() => {
  jest.clearAllMocks()
  hostIsSafeMock.mockResolvedValue(true)
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// DRY-RUN
// ---------------------------------------------------------------------------

describe('runEmailDiscoveryWorker — dry-run', () => {
  it('nao escreve nada (nem marcador) e reporta o achado completo', async () => {
    const { prisma, updateMany, update } = makePrisma([makeLead()])
    safeFetchMock.mockResolvedValueOnce(HTML_EMAIL_CANONICAL_GENERIC)

    const report = await runEmailDiscoveryWorker({ prisma })

    expect(report.dryRun).toBe(true)
    expect(report.scanned).toBe(1)
    expect(report.fetched).toBe(1)
    expect(report.found).toBe(1)
    expect(report.foundGenericCanonical).toBe(1)
    // email generico 35 + website 15 + phone 10 + placeId 10 = 70 >= 60
    expect(report.eligibleAfter).toBe(1)
    expect(report.applied).toBe(0)
    expect(report.foundRate).toBe(1)
    expect(updateMany).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(recordBatchMock).not.toHaveBeenCalled()
  })

  it('aplica os filtros niche/userId e o limit no findMany', async () => {
    const { prisma, findMany } = makePrisma([])

    await runEmailDiscoveryWorker({ prisma, niche: 'dentista', userId: 'user-9', limit: 7 })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: null,
          website: { not: null },
          niche: 'dentista',
          userId: 'user-9',
        }),
        take: 7,
      }),
    )
  })

  it('filtra por fonte via relacao rawLeadData aceitando slug e nome do enum case-insensitive (criterio 9)', async () => {
    const { prisma, findMany } = makePrisma([])

    // slug de provider -> enum correspondente
    await runEmailDiscoveryWorker({ prisma, source: 'google-places' })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rawLeadData: { some: { source: 'GOOGLE_MAPS' } },
        }),
      }),
    )

    // nome do enum em caixa baixa -> case-insensitive
    findMany.mockClear()
    await runEmailDiscoveryWorker({ prisma, source: 'outscraper' })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rawLeadData: { some: { source: 'OUTSCRAPER' } },
        }),
      }),
    )

    // slug divergente do nome do enum
    findMany.mockClear()
    await runEmailDiscoveryWorker({ prisma, source: 'here-maps' })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rawLeadData: { some: { source: 'HERE_PLACES' } },
        }),
      }),
    )
  })

  it('fonte desconhecida lanca erro listando os validos ANTES de qualquer query (criterio 9)', async () => {
    const { prisma, findMany } = makePrisma([])

    await expect(runEmailDiscoveryWorker({ prisma, source: 'fonte-inexistente' })).rejects.toThrow(
      /fonte desconhecida "fonte-inexistente".*GOOGLE_MAPS.*google-places/s,
    )
    expect(findMany).not.toHaveBeenCalled()
  })

  it('sem o filtro de fonte o where nao contem a relacao rawLeadData (criterio 9)', async () => {
    const { prisma, findMany } = makePrisma([])

    await runEmailDiscoveryWorker({ prisma })

    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('rawLeadData')
  })

  it('exclui status terminais no SQL e ordena por id (extensao R3-3 do criterio 10)', async () => {
    const { prisma, findMany } = makePrisma([])

    await runEmailDiscoveryWorker({ prisma })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ['DISCARDED', 'CONVERTED', 'DISQUALIFIED', 'FALSE_POSITIVE'] },
        }),
        orderBy: { id: 'asc' },
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// APPLY
// ---------------------------------------------------------------------------

describe('runEmailDiscoveryWorker — apply', () => {
  it('grava e-mail + integrityScore via updateMany com guard e registra provenance', async () => {
    const { prisma, updateMany, update } = makePrisma([makeLead()])
    safeFetchMock.mockResolvedValueOnce(HTML_EMAIL_CANONICAL_GENERIC)

    const report = await runEmailDiscoveryWorker({ prisma, apply: true })

    expect(report.applied).toBe(1)
    expect(report.skippedRace).toBe(0)
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'lead-1', email: null },
      data: { email: 'contato@empresa.com.br', integrityScore: 70 },
    })
    // enrichmentData ganha o marcador de crawl da home
    const data = update.mock.calls[0][0].data
    expect(data.enrichmentData.contactDiscovery.steps).toEqual([CONTACT_DISCOVERY_STEPS.CRAWL_HOME])
    expect(typeof data.enrichmentData.contactDiscovery.completedAt).toBe('string')
    // provenance do e-mail: source website, sourceUrl da pagina, 0.9 canonical-generico
    expect(recordBatchMock).toHaveBeenCalledWith([
      expect.objectContaining({
        leadId: 'lead-1',
        rawLeadDataId: null,
        field: 'email',
        source: 'website',
        sourceUrl: 'https://empresa.com.br',
        confidence: 0.9,
      }),
    ])
  })

  it('R3-11: recomputo preserva pontos de frescor e multi-fonte do enrichmentData do pipeline', async () => {
    // Lead enriquecido ha 3 dias por 2 fontes: o pipeline persistiu score com
    // +10 (fresh) +10 (multi_source). Antes do fix o worker recomputava sem
    // enrichedAt/enrichmentSources e SOBRESCREVIA com 70 (perda de 20 pontos).
    const lead = makeLead({
      enrichmentData: {
        enrichedAt: daysAgoIso(3),
        sources: ['google-places', 'website'],
      },
    })
    const { prisma, updateMany } = makePrisma([lead])
    safeFetchMock.mockResolvedValueOnce(HTML_EMAIL_CANONICAL_GENERIC)

    const report = await runEmailDiscoveryWorker({ prisma, apply: true })

    // email generico 35 + website 15 + phone 10 + placeId 10 + fresh 10 + multi-fonte 10 = 90
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'lead-1', email: null },
      data: { email: 'contato@empresa.com.br', integrityScore: 90 },
    })
    expect(report.eligibleAfter).toBe(1)
  })

  it('R3-11: tolera enrichedAt como Date e ausencia/shape invalido do bloco', async () => {
    const leads = [
      // Date em memoria (snapshot nao serializado) — vale o ponto de frescor
      makeLead({ id: 'lead-date', enrichmentData: { enrichedAt: new Date(), sources: ['google-places'] } }),
      // shape invalido nao quebra nem pontua
      makeLead({ id: 'lead-bad', enrichmentData: { enrichedAt: 42, sources: 'google-places' } }),
    ]
    const { prisma, updateMany } = makePrisma(leads)
    safeFetchMock.mockResolvedValue(HTML_EMAIL_CANONICAL_GENERIC)

    const report = await runEmailDiscoveryWorker({ prisma, apply: true })

    expect(report.errors).toBe(0)
    // lead-date: 70 base + 10 fresh (1 fonte so, sem multi_source) = 80
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-date', email: null },
        data: expect.objectContaining({ integrityScore: 80 }),
      }),
    )
    // lead-bad: shape invalido ignorado -> 70 base
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-bad', email: null },
        data: expect.objectContaining({ integrityScore: 70 }),
      }),
    )
  })

  it('race (updateMany count 0): conta skippedRace e nao executa mais nenhum write', async () => {
    const { prisma, updateMany, update } = makePrisma([makeLead()], 0)
    safeFetchMock.mockResolvedValueOnce(HTML_EMAIL_CANONICAL_GENERIC)

    const report = await runEmailDiscoveryWorker({ prisma, apply: true })

    expect(report.skippedRace).toBe(1)
    expect(report.applied).toBe(0)
    expect(report.found).toBe(1)
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    expect(recordBatchMock).not.toHaveBeenCalled()
  })

  it('primary em dominio externo NUNCA e aplicado, mas o marcador de crawl e gravado', async () => {
    const { prisma, updateMany, update } = makePrisma([makeLead()])
    safeFetchMock.mockResolvedValueOnce(HTML_EMAIL_EXTERNAL)

    const report = await runEmailDiscoveryWorker({ prisma, apply: true })

    expect(report.found).toBe(1)
    expect(report.foundExternalDomain).toBe(1)
    expect(report.skippedExternalPrimary).toBe(1)
    expect(report.eligibleAfter).toBe(0)
    expect(report.applied).toBe(0)
    expect(updateMany).not.toHaveBeenCalled()
    // crawl aconteceu: marcador persiste para o job de contatabilidade
    expect(update).toHaveBeenCalledTimes(1)
    const data = update.mock.calls[0][0].data
    expect(data.enrichmentData.contactDiscovery.steps).toContain(CONTACT_DISCOVERY_STEPS.CRAWL_HOME)
    expect(recordBatchMock).not.toHaveBeenCalled()
  })

  it('fallback /contato: acha e-mail pessoal na segunda pagina com sourceUrl e steps corretos', async () => {
    const { prisma, updateMany, update } = makePrisma([makeLead()])
    safeFetchMock
      .mockResolvedValueOnce(HTML_SEM_NADA)
      .mockResolvedValueOnce(HTML_EMAIL_CANONICAL_PERSONAL)

    const report = await runEmailDiscoveryWorker({ prisma, apply: true })

    expect(safeFetchMock).toHaveBeenNthCalledWith(1, 'https://empresa.com.br')
    expect(safeFetchMock).toHaveBeenNthCalledWith(2, 'https://empresa.com.br/contato')
    expect(report.found).toBe(1)
    expect(report.foundPersonal).toBe(1)
    expect(report.foundGenericCanonical).toBe(0)
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'joao@empresa.com.br' }),
      }),
    )
    const data = update.mock.calls[0][0].data
    expect(data.enrichmentData.contactDiscovery.steps).toEqual([
      CONTACT_DISCOVERY_STEPS.CRAWL_HOME,
      CONTACT_DISCOVERY_STEPS.CRAWL_CONTACT_PAGE,
    ])
    // canonical-pessoal = confidence 0.75, sourceUrl da pagina /contato
    expect(recordBatchMock).toHaveBeenCalledWith([
      expect.objectContaining({
        field: 'email',
        sourceUrl: 'https://empresa.com.br/contato',
        confidence: 0.75,
      }),
    ])
  })

  it('whatsapp confirmado: persiste bloco no enrichmentData e provenance do numero novo', async () => {
    const { prisma, update } = makePrisma([makeLead()])
    safeFetchMock.mockResolvedValueOnce(HTML_EMAIL_CANONICAL_GENERIC + HTML_WA_LINK)

    const report = await runEmailDiscoveryWorker({ prisma, apply: true })

    expect(report.whatsappConfirmed).toBe(1)
    expect(report.waNumbersExtracted).toBe(1)
    const wa = update.mock.calls[0][0].data.enrichmentData.whatsapp
    expect(wa.level).toBe('confirmed')
    expect(wa.number).toBe('+5511988887777')
    expect(wa.source).toBe('site_html')
    // wa.me 5511988887777 difere de (11) 99999-8888 mesmo tolerando o 55
    expect(wa.numberDivergesFromPhone).toBe(true)
    expect(wa.evidence).toContain('wa.me-link')
    // R3-4: coluna legada sincronizada no MESMO update — sem isso o detalhe
    // do lead (fallback isWhatsappChannel) nao mostrava badge algum
    expect(update.mock.calls[0][0].data.isWhatsappChannel).toBe(true)
    // provenance: e-mail + whatsapp_number no mesmo batch
    const entries = recordBatchMock.mock.calls[0][0]
    expect(entries).toHaveLength(2)
    expect(entries[1]).toEqual(
      expect.objectContaining({
        field: 'whatsapp_number',
        source: 'website',
        sourceUrl: 'https://empresa.com.br',
        confidence: 0.9,
      }),
    )
  })

  it('numero wa.me igual ao ja persistido nao gera provenance de whatsapp_number', async () => {
    const lead = makeLead({
      enrichmentData: {
        whatsapp: {
          level: 'confirmed',
          confidence: 0.6,
          evidence: ['wa.me-link'],
          number: '+5511988887777',
          numberDivergesFromPhone: true,
          source: 'site_html',
          detectedAt: daysAgoIso(30),
        },
      },
    })
    const { prisma } = makePrisma([lead])
    safeFetchMock.mockResolvedValueOnce(HTML_EMAIL_CANONICAL_GENERIC + HTML_WA_LINK)

    await runEmailDiscoveryWorker({ prisma, apply: true })

    const entries = recordBatchMock.mock.calls[0][0]
    expect(entries).toHaveLength(1)
    expect(entries[0].field).toBe('email')
  })

  it('merge preserva chaves pre-existentes e nao rebaixa whatsapp confirmed sem evidencia nova', async () => {
    const prevWhatsapp = {
      level: 'confirmed',
      confidence: 0.8,
      evidence: ['wa.me-link'],
      number: '+5511988887777',
      numberDivergesFromPhone: true,
      source: 'site_html',
      detectedAt: '2026-06-01T00:00:00.000Z',
    }
    const prevCompletedAt = daysAgoIso(1)
    const lead = makeLead({
      enrichmentData: {
        scores: { presence: 10 },
        sources: ['google-places'],
        enrichedAt: '2026-06-01T00:00:00.000Z',
        whatsapp: prevWhatsapp,
        // marcador recente, mas SEM site_crawl_home — nao dispara cooldown
        contactDiscovery: { completedAt: prevCompletedAt, steps: ['enrichment_pipeline'], version: 1 },
      },
    })
    const { prisma, update } = makePrisma([lead])
    safeFetchMock.mockResolvedValueOnce(HTML_EMAIL_CANONICAL_GENERIC)

    await runEmailDiscoveryWorker({ prisma, apply: true })

    const merged = update.mock.calls[0][0].data.enrichmentData
    expect(merged.scores).toEqual({ presence: 10 })
    expect(merged.sources).toEqual(['google-places'])
    expect(merged.enrichedAt).toBe('2026-06-01T00:00:00.000Z')
    // sem evidencia nova de WhatsApp no crawl: bloco existente fica intocado
    expect(merged.whatsapp).toEqual(prevWhatsapp)
    // steps = uniao do que ja existia com o passo novo
    expect(merged.contactDiscovery.steps).toEqual(['enrichment_pipeline', CONTACT_DISCOVERY_STEPS.CRAWL_HOME])
    expect(merged.contactDiscovery.completedAt).not.toBe(prevCompletedAt)
    // sem evidencia nova, a coluna legada tambem nao e tocada
    expect('isWhatsappChannel' in update.mock.calls[0][0].data).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Cooldown / idempotencia
// ---------------------------------------------------------------------------

describe('runEmailDiscoveryWorker — cooldown', () => {
  it('pula lead com site_crawl_home concluido dentro da janela', async () => {
    const lead = makeLead({
      enrichmentData: {
        contactDiscovery: {
          completedAt: daysAgoIso(2),
          steps: [CONTACT_DISCOVERY_STEPS.CRAWL_HOME],
          version: 1,
        },
      },
    })
    const { prisma, updateMany, update } = makePrisma([lead])

    const report = await runEmailDiscoveryWorker({ prisma, apply: true })

    expect(report.skippedRecentlyCrawled).toBe(1)
    expect(report.fetched).toBe(0)
    expect(safeFetchMock).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('re-crawla lead com marcador mais antigo que recrawlCooldownDays', async () => {
    const lead = makeLead({
      enrichmentData: {
        contactDiscovery: {
          completedAt: daysAgoIso(10),
          steps: [CONTACT_DISCOVERY_STEPS.CRAWL_HOME],
          version: 1,
        },
      },
    })
    const { prisma } = makePrisma([lead])
    safeFetchMock.mockResolvedValueOnce(HTML_EMAIL_CANONICAL_GENERIC)

    const report = await runEmailDiscoveryWorker({ prisma })

    expect(report.skippedRecentlyCrawled).toBe(0)
    expect(report.fetched).toBe(1)
    expect(report.found).toBe(1)
  })

  it('starvation (R3-3): cursor avanca alem de uma primeira pagina inteira em cooldown', async () => {
    const cooldownData = {
      contactDiscovery: {
        completedAt: daysAgoIso(1),
        steps: [CONTACT_DISCOVERY_STEPS.CRAWL_HOME],
        version: 1,
      },
    }
    // Base ordenada por id: os 2 primeiros estao em cooldown; com o lote
    // unico antigo (take: limit) os leads 3/4 NUNCA seriam alcancados.
    const allLeads = [
      makeLead({ id: 'lead-1', enrichmentData: cooldownData }),
      makeLead({ id: 'lead-2', enrichmentData: cooldownData }),
      makeLead({ id: 'lead-3' }),
      makeLead({ id: 'lead-4' }),
    ]
    const findMany = jest.fn(
      async (args: { take: number; cursor?: { id: string }; skip?: number }) => {
        const start = args.cursor
          ? allLeads.findIndex((l) => l.id === args.cursor!.id) + (args.skip ?? 0)
          : 0
        return allLeads.slice(start, start + args.take)
      },
    )
    const prisma = {
      lead: {
        findMany,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaClient
    safeFetchMock.mockResolvedValue(HTML_EMAIL_CANONICAL_GENERIC)

    const report = await runEmailDiscoveryWorker({ prisma, limit: 2 })

    // pagina 1 (lead-1/lead-2) toda em cooldown -> cursor busca a pagina 2
    expect(findMany).toHaveBeenCalledTimes(2)
    expect(findMany.mock.calls[1][0]).toEqual(
      expect.objectContaining({ cursor: { id: 'lead-2' }, skip: 1 }),
    )
    expect(report.skippedRecentlyCrawled).toBe(2)
    expect(report.fetched).toBe(2)
    expect(report.found).toBe(2)
    expect(safeFetchMock).toHaveBeenCalledWith('https://empresa.com.br')
  })
})

// ---------------------------------------------------------------------------
// Classificacao de falhas
// ---------------------------------------------------------------------------

describe('runEmailDiscoveryWorker — classificacao de falhas', () => {
  it('classifica invalid_url, dns_blocked_or_unresolved e fetch_failed_or_filtered sem abortar o lote', async () => {
    const leads = [
      makeLead({ id: 'lead-a', website: 'http://exa mple.com' }),
      makeLead({ id: 'lead-b', website: 'https://interno.local' }),
      makeLead({ id: 'lead-c', website: 'https://offline.com' }),
    ]
    const { prisma, updateMany, update } = makePrisma(leads)
    // lead-a falha antes do DNS; lead-b tem host bloqueado; lead-c resolve mas o fetch falha
    hostIsSafeMock.mockResolvedValueOnce(false).mockResolvedValue(true)
    safeFetchMock.mockResolvedValue(null)

    const report = await runEmailDiscoveryWorker({ prisma, apply: true })

    expect(report.scanned).toBe(3)
    expect(report.fetched).toBe(0)
    expect(report.errors).toBe(3)
    expect(report.errorsByClass).toEqual({
      invalid_url: 1,
      dns_blocked_or_unresolved: 1,
      fetch_failed_or_filtered: 1,
      unexpected: 0,
    })
    // falha transitoria NAO grava marcador — proxima execucao re-tenta
    expect(updateMany).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('erro inesperado em um lead conta em unexpected e o lote continua', async () => {
    const leads = [makeLead({ id: 'lead-a' }), makeLead({ id: 'lead-b' })]
    const { prisma } = makePrisma(leads)
    safeFetchMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(HTML_EMAIL_CANONICAL_GENERIC)

    const report = await runEmailDiscoveryWorker({ prisma })

    expect(report.scanned).toBe(2)
    expect(report.errorsByClass.unexpected).toBe(1)
    expect(report.found).toBe(1)
    expect(report.foundRate).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// Cap de paginas (T-06)
// ---------------------------------------------------------------------------

describe('runEmailDiscoveryWorker — cap de paginas por dominio', () => {
  it('MAX_PAGES_PER_DOMAIN e hard limit de 4 e o plano atual usa 2 paginas', async () => {
    expect(MAX_PAGES_PER_DOMAIN).toBe(4)

    const { prisma } = makePrisma([makeLead()])
    safeFetchMock.mockResolvedValue(HTML_SEM_NADA)

    const report = await runEmailDiscoveryWorker({ prisma })

    // home sem e-mail -> tenta /contato -> para (2 <= cap de 4)
    expect(safeFetchMock).toHaveBeenCalledTimes(2)
    expect(safeFetchMock.mock.calls.length).toBeLessThanOrEqual(MAX_PAGES_PER_DOMAIN)
    expect(report.fetched).toBe(1)
    expect(report.found).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Contadores agregados do relatorio
// ---------------------------------------------------------------------------

describe('runEmailDiscoveryWorker — relatorio agregado', () => {
  it('agrega contadores de um lote misto e calcula foundRate/avgMsPerLead', async () => {
    const leads = [
      makeLead({ id: 'lead-1' }), // acha e-mail generico canonico
      makeLead({ id: 'lead-2', website: 'https://outra.com.br' }), // primary externo
      makeLead({ id: 'lead-3', website: 'https://offline.com' }), // fetch falha
    ]
    const { prisma } = makePrisma(leads)
    safeFetchMock
      .mockResolvedValueOnce(HTML_EMAIL_CANONICAL_GENERIC)
      .mockResolvedValueOnce(HTML_EMAIL_EXTERNAL)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const report = await runEmailDiscoveryWorker({ prisma })

    expect(report.scanned).toBe(3)
    expect(report.fetched).toBe(2)
    expect(report.found).toBe(2)
    expect(report.foundGenericCanonical).toBe(1)
    expect(report.foundExternalDomain).toBe(1)
    expect(report.skippedExternalPrimary).toBe(1)
    expect(report.errors).toBe(1)
    expect(report.errorsByClass.fetch_failed_or_filtered).toBe(1)
    expect(report.foundRate).toBeCloseTo(2 / 3)
    expect(report.avgMsPerLead).toBeGreaterThanOrEqual(0)
    expect(report.dryRun).toBe(true)
  })
})
