/**
 * outreach-engine (06-10, task 18/F-18): orquestrador multicanal.
 * Aceite: sem sobrecontato entre canais sem regra de prioridade; histórico
 * único de Lead.status com eventos por canal; nenhum canal "ativado" sem
 * transporte (Zero Orfãos).
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    contactEvent: { findFirst: jest.fn() },
    lead: { findUnique: jest.fn() },
    outreachDispatch: { findFirst: jest.fn() },
  },
}))

import {
  decideChannel,
  resolveSendableChannel,
  CHANNELS_WITH_TRANSPORT,
  DEFAULT_CHANNEL_PRIORITY,
} from '../channel-orchestrator'
import { prisma } from '@/lib/prisma'

const ceFind = prisma.contactEvent.findFirst as jest.Mock
const leadFind = prisma.lead.findUnique as jest.Mock
const dispFind = prisma.outreachDispatch.findFirst as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  ceFind.mockResolvedValue(null) // sem contato recente
  dispFind.mockResolvedValue(null) // sem dispatch ativo
})

it('só EMAIL tem transporte real (Zero Orfãos)', () => {
  expect(CHANNELS_WITH_TRANSPORT).toEqual(['EMAIL'])
  expect(DEFAULT_CHANNEL_PRIORITY).toContain('WHATSAPP')
})

it('bloqueia novo contato se houve contato em qualquer canal nas últimas 24h', async () => {
  ceFind.mockResolvedValue({ id: 'ce-1', channel: 'WHATSAPP' })
  const d = await decideChannel('lead-1')
  expect(d.channel).toBeNull()
  expect(d.reason).toMatch(/sobrecontato/)
})

it('escolhe EMAIL quando lead tem email e nenhum dispatch ativo', async () => {
  leadFind.mockResolvedValue({ email: 'a@b.com', isWhatsappChannel: false })
  const d = await decideChannel('lead-1')
  expect(d.channel).toBe('EMAIL')
  expect(d.transportReady).toBe(true)
})

it('WhatsApp elegível por sinal mas SEM transporte => transportReady=false', async () => {
  leadFind.mockResolvedValue({ email: null, isWhatsappChannel: true })
  const d = await decideChannel('lead-1', { priority: ['WHATSAPP', 'EMAIL'] })
  expect(d.channel).toBe('WHATSAPP')
  expect(d.transportReady).toBe(false)
  expect(d.reason).toMatch(/SEM transporte/)
})

it('resolveSendableChannel faz fallback para canal com transporte (EMAIL)', async () => {
  leadFind.mockResolvedValue({ email: 'a@b.com', isWhatsappChannel: true })
  const d = await resolveSendableChannel('lead-1', { priority: ['WHATSAPP', 'EMAIL'] })
  // WHATSAPP filtrado por falta de transporte => cai em EMAIL
  expect(d.channel).toBe('EMAIL')
  expect(d.transportReady).toBe(true)
})

it('pula canal com dispatch ativo (anti double-send, partial-unique)', async () => {
  leadFind.mockResolvedValue({ email: 'a@b.com', isWhatsappChannel: false })
  dispFind.mockResolvedValue({ id: 'disp-active' }) // EMAIL já ativo
  const d = await decideChannel('lead-1', { priority: ['EMAIL'] })
  expect(d.channel).toBeNull()
})
