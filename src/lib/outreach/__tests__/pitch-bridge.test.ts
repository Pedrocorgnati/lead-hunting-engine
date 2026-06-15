/**
 * outreach-engine (06-10): ponte que garante o email com "o problema".
 * Aceite: gera o pitch lazy no envio; reusa cache <24h; LLM indisponível =>
 * PitchUnavailableError transitório (worker adia, nunca envia vazio).
 */
jest.mock('@/lib/prisma', () => ({
  prisma: { lead: { findUnique: jest.fn(), update: jest.fn() } },
}))
jest.mock('@/lib/pitch/pitch-generator', () => ({
  generatePitch: jest.fn(),
  HallucinatedPitchError: class HallucinatedPitchError extends Error {
    issues: string[]
    constructor(issues: string[]) {
      super('hallucinated')
      this.issues = issues
    }
  },
}))
jest.mock('@/lib/pitch/llm-client', () => ({
  LLMUnavailableError: class LLMUnavailableError extends Error {},
}))

import { ensureLeadPitch, PitchUnavailableError, PitchRejectedError } from '../pitch-bridge'
import { prisma } from '@/lib/prisma'
import { generatePitch, HallucinatedPitchError } from '@/lib/pitch/pitch-generator'
import { LLMUnavailableError } from '@/lib/pitch/llm-client'

const leadFind = prisma.lead.findUnique as jest.Mock
const leadUpdate = prisma.lead.update as jest.Mock
const genPitch = generatePitch as jest.Mock

const NOW = new Date('2026-06-10T12:00:00Z')

const LEAD = {
  businessName: 'Padaria Central',
  category: 'padaria',
  city: 'Campinas',
  state: 'SP',
  phone: null,
  website: null,
  rating: null,
  reviewCount: null,
  score: 80,
  scoreBreakdown: { digital_gap: { score: 90 } },
  opportunities: ['A_NEEDS_SITE'],
  pitchContent: null,
  pitchTone: null,
  updatedAt: NOW,
}

beforeEach(() => {
  jest.clearAllMocks()
  leadUpdate.mockResolvedValue({})
})

it('gera pitch quando ausente e persiste', async () => {
  leadFind.mockResolvedValue(LEAD)
  genPitch.mockResolvedValue({ pitch: 'Notei que seu negócio não tem site...', provider: 'openai' })
  const r = await ensureLeadPitch('lead-1', { userId: 'u-1' }, NOW)
  expect(r.generated).toBe(true)
  expect(r.content).toMatch(/não tem site/)
  expect(genPitch).toHaveBeenCalled()
  expect(leadUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ pitchContent: r.content }) }),
  )
})

it('reusa pitch fresco (<24h, mesmo tom) sem chamar LLM', async () => {
  leadFind.mockResolvedValue({
    ...LEAD,
    pitchContent: 'pitch cacheado',
    pitchTone: 'formal',
    updatedAt: new Date(NOW.getTime() - 3600_000),
  })
  const r = await ensureLeadPitch('lead-1', { userId: 'u-1', tone: 'formal' }, NOW)
  expect(r.generated).toBe(false)
  expect(r.content).toBe('pitch cacheado')
  expect(genPitch).not.toHaveBeenCalled()
})

it('regenera pitch expirado (>24h)', async () => {
  leadFind.mockResolvedValue({
    ...LEAD,
    pitchContent: 'antigo',
    pitchTone: 'formal',
    updatedAt: new Date(NOW.getTime() - 48 * 3600_000),
  })
  genPitch.mockResolvedValue({ pitch: 'novo pitch', provider: 'openai' })
  const r = await ensureLeadPitch('lead-1', { userId: 'u-1', tone: 'formal' }, NOW)
  expect(r.generated).toBe(true)
  expect(r.content).toBe('novo pitch')
})

it('LLM indisponível => PitchUnavailableError transitório (não permanente)', async () => {
  leadFind.mockResolvedValue(LEAD)
  genPitch.mockRejectedValue(new LLMUnavailableError('sem provider'))
  await expect(ensureLeadPitch('lead-1', { userId: 'u-1' }, NOW)).rejects.toBeInstanceOf(PitchUnavailableError)
  try {
    await ensureLeadPitch('lead-1', { userId: 'u-1' }, NOW)
  } catch (e) {
    expect((e as PitchUnavailableError).permanent).toBe(false)
    expect((e as PitchUnavailableError).reasonCode).toBe('provider')
  }
})

it('anti-alucinação => PitchRejectedError PERMANENTE (revisão humana, sem loop de defer)', async () => {
  leadFind.mockResolvedValue(LEAD)
  genPitch.mockRejectedValue(new HallucinatedPitchError(['inventou dado']))
  await expect(ensureLeadPitch('lead-1', { userId: 'u-1' }, NOW)).rejects.toBeInstanceOf(PitchRejectedError)
  try {
    await ensureLeadPitch('lead-1', { userId: 'u-1' }, NOW)
  } catch (e) {
    expect((e as PitchRejectedError).permanent).toBe(true)
    expect((e as PitchRejectedError).reasonCode).toBe('validation')
  }
})

it('lead inexistente => erro permanente (validation)', async () => {
  leadFind.mockResolvedValue(null)
  await expect(ensureLeadPitch('lead-x', { userId: 'u-1' }, NOW)).rejects.toMatchObject({ permanent: true })
})
