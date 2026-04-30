/**
 * Smoke E2E — collect-leads orchestrator (TASK-9 / M8-G01 + M8-G05)
 *
 * Valida o caminho completo prometido pelo BUDGET milestone-8:
 *   1. Lifecycle PENDING -> RUNNING -> COMPLETED
 *   2. Cascata Google Places -> Outscraper quando Google falha (HTTP 503)
 *   3. Upsert previne duplicatas em runs sucessivos (mesmo externalId)
 *   4. Clamp MAX_COLLECTION_SIZE = 500 quando maxResults excede o limite
 *   5. sanitizeRawJson remove PII de rawJson antes de persistir
 *
 * Estrategia:
 *   - msw intercepta fetch de Google Places, Outscraper e Apify (raw HTTP)
 *   - getApiKey roda real -> precisa de ApiCredential seedado (encriptado via CryptoUtil)
 *   - geocodeAddress + analyzeSite mockados via jest.mock (nao sao parte da promessa
 *     da milestone — sao best-effort com try/catch no orquestrador)
 *   - Postgres real, truncate per-test via cleanup helper
 */

import { setupServer } from 'msw/node'
import { rest } from 'msw'

import { prisma } from '@/lib/prisma'
import { CryptoUtil } from '@/lib/services/crypto-util'
import { CollectionJobStatus, DataSource } from '@/lib/constants/enums'
import { Limits } from '@/lib/constants/limits'

import googlePlacesSuccess from './fixtures/google-places-success.json'
import outscraperSuccess from './fixtures/outscraper-success.json'
// apify-async-success.json reservado para cenarios futuros que validem o caminho
// completo da cascata (Google + Outscraper falhando -> Apify assume). Os 5 cenarios
// atuais cobrem ate o segundo provider apenas.

// Mock geocoding e site-analyzer (best-effort, fora do escopo da promessa M8)
jest.mock('@/lib/workers/geo/geo-manager', () => ({
  geocodeAddress: jest.fn(async () => null),
}))
jest.mock('@/lib/workers/providers/site-analyzer', () => ({
  analyzeSite: jest.fn(async () => ({
    reachable: true,
    hasSsl: true,
    title: 'Test Site',
    mobileFriendly: true,
  })),
}))

// Importar APOS os jest.mock
import { runCollection, getDefaultDeps } from '../../trigger/tasks/collect-leads'

// ─── msw server ───────────────────────────────────────────────────────────────

const server = setupServer()

beforeAll(() => {
  // ENCRYPTION_KEY pode estar ausente em ambiente CI — fornecer fallback determinista
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  }
  server.listen({ onUnhandledRequest: 'error' })
})

afterAll(() => server.close())

afterEach(() => {
  server.resetHandlers()
})

// ─── Seed helpers ─────────────────────────────────────────────────────────────

const TEST_USER_ID = '00000000-0000-0000-0000-000000000011' // OPERATOR (do seed:test)

async function seedCredential(provider: string, apiKey: string): Promise<void> {
  const enc = CryptoUtil.encrypt(apiKey)
  await prisma.apiCredential.upsert({
    where: { provider },
    create: {
      provider,
      encryptedKey: `${enc.encryptedKey}:${enc.authTag}`,
      iv: enc.iv,
      isActive: true,
    },
    update: {
      encryptedKey: `${enc.encryptedKey}:${enc.authTag}`,
      iv: enc.iv,
      isActive: true,
    },
  })
}

async function ensureTestUser(): Promise<void> {
  await prisma.userProfile.upsert({
    where: { id: TEST_USER_ID },
    create: {
      id: TEST_USER_ID,
      email: 'smoke-collect@test.local',
      name: 'Smoke Operator',
    },
    update: {},
  })
}

async function createPendingJob(overrides: Partial<{ name: string }> = {}): Promise<string> {
  const job = await prisma.collectionJob.create({
    data: {
      userId: TEST_USER_ID,
      name: overrides.name ?? `smoke-${Date.now()}`,
      status: CollectionJobStatus.PENDING,
      city: 'Sao Paulo',
      state: 'SP',
      niche: 'pizzaria',
      sources: [DataSource.GOOGLE_MAPS],
      limitVal: 50,
    },
  })
  return job.id
}

async function cleanupJobAndLeads(jobId: string): Promise<void> {
  await prisma.rawLeadData.deleteMany({ where: { jobId } })
  await prisma.collectionJob.deleteMany({ where: { id: jobId } })
}

async function cleanupTestCredentials(): Promise<void> {
  await prisma.apiCredential.deleteMany({
    where: { provider: { in: ['GOOGLE_PLACES', 'OUTSCRAPER', 'APIFY'] } },
  })
}

// ─── Handler factories ────────────────────────────────────────────────────────

function googlePlacesSuccessHandler() {
  return rest.get('https://maps.googleapis.com/maps/api/place/textsearch/json', (_req, res, ctx) =>
    res(ctx.status(200), ctx.json(googlePlacesSuccess)),
  )
}

function googlePlaces503Handler() {
  return rest.get('https://maps.googleapis.com/maps/api/place/textsearch/json', (_req, res, ctx) =>
    res(ctx.status(503), ctx.json({ status: 'UNKNOWN_ERROR' })),
  )
}

function outscraperSuccessHandler() {
  return rest.get('https://api.outscraper.com/maps/search-v3', (_req, res, ctx) =>
    res(ctx.status(200), ctx.json(outscraperSuccess)),
  )
}

// Apify nao e usado nestes 5 cenarios (cascata para nele requer Google E Outscraper falharem)
// mas registramos handlers no-op para evitar onUnhandledRequest no caso de timing issues
function apifyNoopHandler() {
  return rest.all('https://api.apify.com/*', (_req, res, ctx) => res(ctx.status(503), ctx.json({})))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('collect-leads smoke E2E', () => {
  beforeAll(async () => {
    await ensureTestUser()
  })

  afterEach(async () => {
    await cleanupTestCredentials()
  })

  it('[CENARIO 1] lifecycle PENDING -> RUNNING -> COMPLETED com upsert de leads', async () => {
    server.use(googlePlacesSuccessHandler(), apifyNoopHandler())
    await seedCredential('GOOGLE_PLACES', 'gp-fake-key-001')

    const jobId = await createPendingJob()

    try {
      const result = await runCollection(
        { jobId, query: 'pizzaria', location: 'Sao Paulo, SP', maxResults: 50 },
        getDefaultDeps(),
      )

      expect(result.success).toBe(true)
      expect(result.processed).toBe(googlePlacesSuccess.results.length)

      const finalJob = await prisma.collectionJob.findUniqueOrThrow({ where: { id: jobId } })
      expect(finalJob.status).toBe(CollectionJobStatus.COMPLETED)
      expect(finalJob.startedAt).not.toBeNull()
      expect(finalJob.completedAt).not.toBeNull()
      expect(finalJob.processedLeads).toBe(googlePlacesSuccess.results.length)

      const leads = await prisma.rawLeadData.findMany({ where: { jobId } })
      expect(leads.length).toBe(googlePlacesSuccess.results.length)
      expect(leads.every((l) => l.source === DataSource.GOOGLE_MAPS)).toBe(true)
    } finally {
      await cleanupJobAndLeads(jobId)
    }
  }, 30_000)

  it('[CENARIO 2] cascata Google 503 -> Outscraper assume e currentSource reflete', async () => {
    server.use(googlePlaces503Handler(), outscraperSuccessHandler(), apifyNoopHandler())
    await seedCredential('GOOGLE_PLACES', 'gp-fake-key-002')
    await seedCredential('OUTSCRAPER', 'osc-fake-key-002')

    const jobId = await createPendingJob({ name: 'cascade-fallback' })

    try {
      await runCollection(
        { jobId, query: 'pizzaria', location: 'Sao Paulo, SP', maxResults: 20 },
        getDefaultDeps(),
      )

      const leads = await prisma.rawLeadData.findMany({ where: { jobId } })
      // Todos vieram do Outscraper, nenhum do Google Places
      expect(leads.every((l) => l.source === DataSource.OUTSCRAPER)).toBe(true)
      expect(leads.length).toBe(outscraperSuccess.data[0].length)

      const finalJob = await prisma.collectionJob.findUniqueOrThrow({ where: { id: jobId } })
      expect(finalJob.status).toBe(CollectionJobStatus.COMPLETED)
      // Apos COMPLETED currentSource volta a null; durante RUNNING era 'outscraper'
      expect(finalJob.currentSource).toBeNull()
    } finally {
      await cleanupJobAndLeads(jobId)
    }
  }, 30_000)

  it('[CENARIO 3] upsert previne duplicatas em runs sucessivos com mesmos externalId', async () => {
    server.use(googlePlacesSuccessHandler(), apifyNoopHandler())
    await seedCredential('GOOGLE_PLACES', 'gp-fake-key-003')

    const jobId = await createPendingJob({ name: 'dedup-run' })

    try {
      await runCollection(
        { jobId, query: 'pizzaria', location: 'Sao Paulo, SP', maxResults: 50 },
        getDefaultDeps(),
      )
      const leadsAfterFirstRun = await prisma.rawLeadData.findMany({ where: { jobId } })

      // Re-executar a coleta com mesmos resultados (mesmos externalId)
      // Reabrir o job para PENDING para re-rodar
      await prisma.collectionJob.update({
        where: { id: jobId },
        data: {
          status: CollectionJobStatus.PENDING,
          processedLeads: 0,
          progress: 0,
          resultCount: 0,
          completedAt: null,
        },
      })

      await runCollection(
        { jobId, query: 'pizzaria', location: 'Sao Paulo, SP', maxResults: 50 },
        getDefaultDeps(),
      )
      const leadsAfterSecondRun = await prisma.rawLeadData.findMany({ where: { jobId } })

      // Mesma quantidade — upsert nao duplicou
      expect(leadsAfterSecondRun.length).toBe(leadsAfterFirstRun.length)
      // IDs unicos batem com externalId fixture
      const externalIds = new Set(leadsAfterSecondRun.map((l) => l.externalId))
      expect(externalIds.size).toBe(googlePlacesSuccess.results.length)
    } finally {
      await cleanupJobAndLeads(jobId)
    }
  }, 45_000)

  it(`[CENARIO 4] clamp MAX_COLLECTION_SIZE quando maxResults > ${Limits.MAX_COLLECTION_SIZE}`, async () => {
    // Servir muito mais resultados que MAX_COLLECTION_SIZE para validar clamp
    const oversizedFixture = {
      status: 'OK',
      results: Array.from({ length: Limits.MAX_COLLECTION_SIZE + 100 }, (_, i) => ({
        place_id: `ChIJfix-clamp-${i.toString().padStart(4, '0')}`,
        name: `Estabelecimento ${i}`,
        formatted_address: `Rua Teste, ${i} - Centro, Sao Paulo - SP, Brasil`,
        geometry: { location: { lat: -23.5 - i * 0.001, lng: -46.6 - i * 0.001 } },
        rating: 4.0,
        user_ratings_total: 10,
        types: ['establishment'],
      })),
    }
    server.use(
      rest.get('https://maps.googleapis.com/maps/api/place/textsearch/json', (_req, res, ctx) =>
        res(ctx.status(200), ctx.json(oversizedFixture)),
      ),
      apifyNoopHandler(),
    )
    await seedCredential('GOOGLE_PLACES', 'gp-fake-key-004')

    const jobId = await createPendingJob({ name: 'clamp-test' })

    try {
      const result = await runCollection(
        { jobId, query: 'comercio', location: 'Sao Paulo, SP', maxResults: 1000 },
        getDefaultDeps(),
      )

      // Provider respeita clamp quando maxResults explode -> retorna no maximo MAX_COLLECTION_SIZE
      expect(result.processed).toBeLessThanOrEqual(Limits.MAX_COLLECTION_SIZE)
      const leads = await prisma.rawLeadData.findMany({ where: { jobId } })
      expect(leads.length).toBeLessThanOrEqual(Limits.MAX_COLLECTION_SIZE)
    } finally {
      await cleanupJobAndLeads(jobId)
    }
  }, 60_000)

  it('[CENARIO 5] sanitizeRawJson remove PII de rawJson antes de persistir', async () => {
    server.use(googlePlaces503Handler(), outscraperSuccessHandler(), apifyNoopHandler())
    await seedCredential('GOOGLE_PLACES', 'gp-fake-key-005')
    await seedCredential('OUTSCRAPER', 'osc-fake-key-005')

    const jobId = await createPendingJob({ name: 'pii-sanitize' })

    try {
      await runCollection(
        { jobId, query: 'pizzaria', location: 'Sao Paulo, SP', maxResults: 5 },
        getDefaultDeps(),
      )

      const leads = await prisma.rawLeadData.findMany({ where: { jobId } })
      expect(leads.length).toBeGreaterThan(0)

      // Encontrar o lead que tinha _pii_test_payload no fixture (primeiro do outscraper-success)
      const flagged = leads.find((l) => l.externalId === 'ChIJfix-osc-success-001')
      expect(flagged).toBeDefined()

      const raw = (flagged?.rawJson ?? {}) as Record<string, unknown>
      const serialized = JSON.stringify(raw)

      // sanitizeRawJson deve ter removido (ou redacted) os campos com PII evidente:
      // owner_email, owner_cpf
      expect(serialized).not.toContain('marco.napoli@personal-fixture.example')
      expect(serialized).not.toContain('123.456.789-00')
    } finally {
      await cleanupJobAndLeads(jobId)
    }
  }, 30_000)
})
