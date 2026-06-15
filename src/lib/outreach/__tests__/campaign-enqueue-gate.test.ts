/**
 * outreach-engine (06-10, fixes da revisão): envelope de qualidade no enqueue.
 * Aceite: lead sem integrityScore (null) NÃO passa silenciosamente; e-mail
 * malformado não consome slot; só lead pronto entra em auto-outbound.
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    outreachCampaign: { findUnique: jest.fn() },
    lead: { findMany: jest.fn() },
    outreachDispatch: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []), create: jest.fn() },
  },
}))
jest.mock('@/lib/outreach/mailbox-service', () => ({ pickHealthyMailbox: jest.fn(async () => ({ id: 'mb-1', minGapSeconds: 90 })) }))
jest.mock('@/lib/outreach/suppression', () => ({
  extractDomain: (e: string) => e.split('@')[1] ?? null,
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
  checkSuppression: jest.fn(async () => ({ available: true, suppressed: false })),
}))
jest.mock('@/lib/workers/outreach-dispatch', () => ({ dispatchOutreachSend: jest.fn(async () => ({ mode: 'local_queue' })) }))
jest.mock('@/lib/services/system-config', () => ({ getConfig: jest.fn(async () => ({ minIntegrityScore: 60, blockGenericEmail: false })) }))
jest.mock('@/lib/telemetry', () => ({ track: jest.fn(async () => undefined), makeCorrelationId: jest.fn(() => 'c') }))
jest.mock('@/lib/intelligence/enrichment/enrichers', () => ({ isGenericEmail: jest.fn(() => false) }))

import { enqueueCampaignDispatches } from '../campaign-service'
import { prisma } from '@/lib/prisma'

const campFind = prisma.outreachCampaign.findUnique as jest.Mock
const leadFind = prisma.lead.findMany as jest.Mock
const dispCreate = prisma.outreachDispatch.create as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  campFind.mockResolvedValue({ id: 'c1', userId: 'u1', status: 'ACTIVE', approvedBy: 'u1', dryRun: true, niche: null, abConfig: null })
  dispCreate.mockResolvedValue({ id: 'd1' })
})

it('bloqueia lead com integrityScore null (não passa silenciosamente)', async () => {
  leadFind.mockResolvedValue([{ id: 'L1', email: 'a@b.com', score: 50, integrityScore: null }])
  const r = await enqueueCampaignDispatches('c1')
  expect(r.created).toBe(0)
  expect(r.skipped[0].reason).toMatch(/sem score de integridade/)
})

it('bloqueia lead com integridade abaixo do limiar', async () => {
  leadFind.mockResolvedValue([{ id: 'L1', email: 'a@b.com', score: 50, integrityScore: 40 }])
  const r = await enqueueCampaignDispatches('c1')
  expect(r.created).toBe(0)
  expect(r.skipped[0].reason).toMatch(/abaixo do limiar/)
})

it('bloqueia e-mail malformado não-null (não consome slot)', async () => {
  leadFind.mockResolvedValue([{ id: 'L1', email: 'a-definir', score: 80, integrityScore: 90 }])
  const r = await enqueueCampaignDispatches('c1')
  expect(r.created).toBe(0)
  expect(r.skipped[0].reason).toMatch(/malformado/)
})

it('enfileira lead pronto (e-mail válido + integridade ok)', async () => {
  leadFind.mockResolvedValue([{ id: 'L1', email: 'contato@padaria.com.br', score: 80, integrityScore: 75 }])
  const r = await enqueueCampaignDispatches('c1')
  expect(r.created).toBe(1)
  expect(r.skipped).toHaveLength(0)
})
