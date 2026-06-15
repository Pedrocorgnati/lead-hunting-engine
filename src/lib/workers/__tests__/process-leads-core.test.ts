/**
 * Testes de regressao do core RawLeadData -> Lead (review 06-11 R3-1/R3-2):
 *  - re-enriquecimento (branch update) NUNCA rebaixa o bloco whatsapp
 *    'confirmed' gravado pelo email-discovery-worker;
 *  - phoneNormalized e backfillado no update e normalizado em E.164 real no
 *    create (fixo de 10 digitos incluso).
 * Sem banco/rede: prisma e servicos com I/O sao mockados; enrichLead roda real
 * (puro) para o teste exercitar o derive de whatsapp de verdade.
 */
const mockPrisma = {
  collectionJob: { findUnique: jest.fn() },
  rawLeadData: { findMany: jest.fn(), update: jest.fn() },
  lead: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
}

jest.mock('@/lib/prisma', () => ({
  getPrisma: () => mockPrisma,
}))
jest.mock('@/lib/intelligence/scoring/scoring-engine', () => ({
  calculateScore: jest.fn(async () => ({ totalScore: 42, breakdown: {}, signals: [] })),
}))
jest.mock('@/lib/intelligence/classifier/opportunity-classifier', () => ({
  classifyOpportunityWithConfig: jest.fn(() => 'A_NEEDS_SITE'),
}))
jest.mock('@/lib/intelligence/classifier/rules-loader', () => ({
  loadClassificationRules: jest.fn(async () => null),
}))
jest.mock('@/lib/intelligence/enrichment/enrichers', () => ({
  runDetailedEnrichment: jest.fn(async () => null),
  isGenericEmail: jest.requireActual('@/lib/intelligence/enrichment/enrichers/email-prioritizer')
    .isGenericEmail,
}))
jest.mock('@/lib/intelligence/provenance/provenance-service', () => ({
  ProvenanceService: {
    buildEntries: jest.fn(() => []),
    recordBatch: jest.fn(async () => undefined),
  },
}))
jest.mock('@/lib/intelligence/dedup-engine', () => ({
  DedupEngine: {
    check: jest.fn(async () => ({ isDuplicate: false, existingLeadId: null, similarity: 0 })),
  },
}))
jest.mock('@/lib/notifications/dispatcher', () => ({
  dispatchLeadHot: jest.fn(async () => undefined),
}))

import { runProcessLeads, type ProcessLeadsLogger } from '../process-leads-core'
import type { WhatsappEnrichment } from '@/lib/intelligence/enrichment/enrichment-data'

const silentLogger: ProcessLeadsLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

const WA_CONFIRMED: WhatsappEnrichment = {
  level: 'confirmed',
  confidence: 0.9,
  evidence: ['wa.me-link'],
  number: '+5511988887777',
  numberDivergesFromPhone: true,
  source: 'site_html',
  detectedAt: '2026-06-01T00:00:00.000Z',
}

/** Linha minima de RawLeadData que o core consome. */
function makeRaw(overrides: Record<string, unknown> = {}) {
  return {
    id: 'raw-1',
    jobId: 'job-1',
    externalId: 'place-1',
    businessName: 'Padaria Boa',
    address: 'Rua A, 1',
    city: 'Sao Paulo',
    state: 'SP',
    // Fixo de 10 digitos: o caso que o normalizador antigo deixava cru.
    phone: '(11) 3333-4444',
    website: 'https://empresa.com.br',
    category: 'bakery',
    lat: null,
    lng: null,
    rating: null,
    reviewCount: null,
    openNow: null,
    priceLevel: null,
    siteReachable: null,
    siteHasSsl: null,
    siteMobileFriendly: null,
    instagramFollowers: null,
    facebookFollowers: null,
    facebookLastPostAt: null,
    facebookEngagementRate: null,
    source: 'GOOGLE_MAPS',
    rawJson: {},
    email: null,
    phoneNormalized: null,
    leadId: null,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.collectionJob.findUnique.mockResolvedValue({ niche: 'padaria', city: 'Sao Paulo' })
  mockPrisma.rawLeadData.update.mockResolvedValue({})
  mockPrisma.lead.update.mockResolvedValue({})
  mockPrisma.lead.create.mockResolvedValue({ id: 'lead-novo' })
  mockPrisma.lead.findUnique.mockResolvedValue({ enrichmentData: {}, phoneNormalized: null })
})

describe('runProcessLeads — guard do bloco whatsapp no update (R3-1)', () => {
  it("re-enriquecimento sem siteHtml NAO rebaixa o 'confirmed' + numero do worker", async () => {
    mockPrisma.rawLeadData.findMany.mockResolvedValue([makeRaw({ leadId: 'lead-1' })])
    mockPrisma.lead.findUnique.mockResolvedValue({
      enrichmentData: {
        whatsapp: WA_CONFIRMED,
        contactDiscovery: {
          completedAt: '2026-06-10T00:00:00.000Z',
          steps: ['site_crawl_home'],
          version: 1,
        },
      },
      phoneNormalized: '+5511988887777',
    })

    const result = await runProcessLeads({ jobId: 'job-1', userId: 'user-1' }, silentLogger)

    expect(result.processed).toBe(1)
    expect(mockPrisma.lead.update).toHaveBeenCalledTimes(1)
    const data = mockPrisma.lead.update.mock.calls[0][0].data
    // sem siteHtml o derive da pipeline retorna 'unknown' (telefone fixo) —
    // o guard omite a chave e o bloco confirmado do worker fica intocado
    expect(data.enrichmentData.whatsapp).toEqual(WA_CONFIRMED)
    // a composicao dos passos de descoberta continua funcionando
    expect(data.enrichmentData.contactDiscovery.steps).toEqual([
      'site_crawl_home',
      'enrichment_pipeline',
    ])
  })

  it("upgrade: siteHtml com link wa.me substitui bloco 'probable' por 'confirmed'", async () => {
    mockPrisma.rawLeadData.findMany.mockResolvedValue([
      makeRaw({
        leadId: 'lead-1',
        phone: '(11) 99999-8888',
        rawJson: { siteHtml: '<a href="https://wa.me/5511988887777">chame no zap</a>' },
      }),
    ])
    mockPrisma.lead.findUnique.mockResolvedValue({
      enrichmentData: {
        whatsapp: { ...WA_CONFIRMED, level: 'probable', source: 'phone_classifier', number: null },
      },
      phoneNormalized: '+5511999998888',
    })

    await runProcessLeads({ jobId: 'job-1', userId: 'user-1' }, silentLogger)

    const data = mockPrisma.lead.update.mock.calls[0][0].data
    expect(data.enrichmentData.whatsapp.level).toBe('confirmed')
    expect(data.enrichmentData.whatsapp.number).toBe('+5511988887777')
  })
})

describe('runProcessLeads — phoneNormalized (R3-2)', () => {
  it('update backfilla phoneNormalized em E.164 quando o lead nao tem (fixo 10 digitos)', async () => {
    mockPrisma.rawLeadData.findMany.mockResolvedValue([makeRaw({ leadId: 'lead-1' })])
    mockPrisma.lead.findUnique.mockResolvedValue({ enrichmentData: {}, phoneNormalized: null })

    await runProcessLeads({ jobId: 'job-1', userId: 'user-1' }, silentLogger)

    const data = mockPrisma.lead.update.mock.calls[0][0].data
    expect(data.phoneNormalized).toBe('+551133334444')
  })

  it('update NAO sobrescreve phoneNormalized existente', async () => {
    mockPrisma.rawLeadData.findMany.mockResolvedValue([makeRaw({ leadId: 'lead-1' })])
    mockPrisma.lead.findUnique.mockResolvedValue({
      enrichmentData: {},
      phoneNormalized: '+5511999998888',
    })

    await runProcessLeads({ jobId: 'job-1', userId: 'user-1' }, silentLogger)

    const data = mockPrisma.lead.update.mock.calls[0][0].data
    expect('phoneNormalized' in data).toBe(false)
  })

  it('create grava phoneNormalized E.164 real (nao o trim cru do fixo) e o bloco whatsapp', async () => {
    mockPrisma.rawLeadData.findMany.mockResolvedValue([makeRaw()])

    await runProcessLeads({ jobId: 'job-1', userId: 'user-1' }, silentLogger)

    expect(mockPrisma.lead.create).toHaveBeenCalledTimes(1)
    const data = mockPrisma.lead.create.mock.calls[0][0].data
    expect(data.phoneNormalized).toBe('+551133334444')
    // create nao tem bloco previo: whatsapp derivado entra direto
    expect(data.enrichmentData.whatsapp.level).toBe('unknown')
    expect(data.enrichmentData.contactDiscovery.steps).toEqual(['enrichment_pipeline'])
  })

  it('raw.phoneNormalized (quando o coletor ja normalizou) tem precedencia', async () => {
    mockPrisma.rawLeadData.findMany.mockResolvedValue([
      makeRaw({ phoneNormalized: '+5511999998888' }),
    ])

    await runProcessLeads({ jobId: 'job-1', userId: 'user-1' }, silentLogger)

    const data = mockPrisma.lead.create.mock.calls[0][0].data
    expect(data.phoneNormalized).toBe('+5511999998888')
  })
})
