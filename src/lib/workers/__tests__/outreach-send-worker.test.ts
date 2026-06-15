/**
 * outreach-engine (06-10, tasks 08/09/10/11/13/14): worker outreach-send.
 *
 * Aceites cobertos:
 *  - claim idempotente: conflito nao dispara duplicacao (08);
 *  - endereco suprimido nao e enviado (10);
 *  - preflight bloqueado (kill switch off) => nada sai, sem falha hard (11);
 *  - janela fechada => defer sem falha hard (11);
 *  - sucesso => ContactEvent SENT + dispatch SENT (09);
 *  - erro ambiguo => AMBIGUOUS, nunca re-envio cego (02/9.x);
 *  - hard bounce => supressao automatica + BOUNCED (14).
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    outreachDispatch: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    outreachMailbox: { update: jest.fn() },
    outreachSequence: { findUnique: jest.fn() },
    outreachSequenceStep: { findFirst: jest.fn() },
    contactEvent: { findFirst: jest.fn() },
    lead: { findUnique: jest.fn() },
  },
}))

jest.mock('@/lib/outreach/preflight', () => ({
  checkOutboundPreconditions: jest.fn(),
}))
jest.mock('@/lib/outreach/suppression', () => ({
  checkSuppression: jest.fn(),
  addSuppression: jest.fn(async () => ({ id: 'sup-1' })),
}))
jest.mock('@/lib/outreach/mailbox-service', () => ({
  toSmtpConfig: jest.fn(),
  markMailboxUnhealthy: jest.fn(),
}))
jest.mock('@/lib/outreach/smtp-transport', () => ({
  sendViaSmtp: jest.fn(),
}))
jest.mock('@/lib/outreach/lead-status-bridge', () => ({
  applyOutcome: jest.fn(async () => ({ contactEventId: 'ce-1', transitioned: true })),
  checkLeadEventConsistency: jest.fn(async () => ({ consistent: true, leadStatus: 'NEW', lastOutcome: null })),
}))
jest.mock('@/lib/outreach/pitch-bridge', () => {
  const actual = jest.requireActual('@/lib/outreach/pitch-bridge')
  return {
    ...actual,
    ensureLeadPitch: jest.fn(async () => ({ content: 'Olá, notei que seu negócio não tem site.', tone: 'formal', generated: true })),
  }
})
import { ensureLeadPitch, PitchUnavailableError, PitchRejectedError } from '@/lib/outreach/pitch-bridge'
jest.mock('@/lib/services/system-config', () => ({
  getOutreachThresholds: jest.fn(async () => ({
    maxBounceRate: 0.05,
    minSampleForBounceRate: 20,
    domainCooldownHours: 72,
    emailCooldownHours: 168,
    failureBaselineMultiplier: 3,
    domainDailyCap: 5,
  })),
  // sender-profile.ts (perfil do remetente) le 'outreach.sender_profile' via
  // getConfig; objeto vazio ativa o DEFAULT_PROFILE, espelhando o fallback de
  // DEFAULTS do modulo real.
  getConfig: jest.fn(async () => ({})),
  setConfig: jest.fn(async () => undefined),
}))
jest.mock('@/lib/telemetry', () => ({
  track: jest.fn(async () => undefined),
  makeCorrelationId: jest.fn(() => 'cor-1'),
}))
jest.mock('@/lib/alerts/dedup', () => ({
  claimAlertSlot: jest.fn(async () => true),
}))

import { runOutreachSend } from '../outreach-send-worker'
import { PoisonPayloadError, CodedError } from '../reason-codes'
import { prisma } from '@/lib/prisma'
import { checkOutboundPreconditions } from '@/lib/outreach/preflight'
import { checkSuppression } from '@/lib/outreach/suppression'
import { addSuppression } from '@/lib/outreach/suppression'
import { toSmtpConfig } from '@/lib/outreach/mailbox-service'
import { sendViaSmtp } from '@/lib/outreach/smtp-transport'
import { applyOutcome } from '@/lib/outreach/lead-status-bridge'

const dFindUnique = prisma.outreachDispatch.findUnique as jest.Mock
const dFindFirst = prisma.outreachDispatch.findFirst as jest.Mock
const dUpdate = prisma.outreachDispatch.update as jest.Mock
const dUpdateMany = prisma.outreachDispatch.updateMany as jest.Mock
const dCreate = prisma.outreachDispatch.create as jest.Mock
const dCount = prisma.outreachDispatch.count as jest.Mock
const mailboxUpdate = prisma.outreachMailbox.update as jest.Mock
const stepFindFirst = prisma.outreachSequenceStep.findFirst as jest.Mock
const leadFindUnique = prisma.lead.findUnique as jest.Mock
const preflight = checkOutboundPreconditions as jest.Mock
const suppression = checkSuppression as jest.Mock
const smtpConfig = toSmtpConfig as jest.Mock
const smtpSend = sendViaSmtp as jest.Mock
const outcome = applyOutcome as jest.Mock
const suppress = addSuppression as jest.Mock

const MAILBOX = {
  id: 'mb-1',
  emailAddress: 'vendas@dominio.com.br',
  status: 'ACTIVE',
  timezone: 'America/Sao_Paulo',
  sendWindowStart: '00:00',
  sendWindowEnd: '23:59',
  dailyCap: 50,
  minGapSeconds: 0,
  jitterSeconds: 0,
  lastSentAt: null,
}

const CAMPAIGN = {
  id: 'camp-1',
  status: 'ACTIVE',
  killSwitch: false,
  dryRun: false,
  approvedBy: 'user-1',
  approvedAt: new Date(),
  market: 'BR',
  marketGateApprovedBy: null,
  marketGateApprovedAt: null,
  sequenceId: null,
  abConfig: null,
}

function makeDispatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'disp-1',
    campaignId: 'camp-1',
    leadId: 'lead-1',
    userId: 'user-1',
    mailboxId: 'mb-1',
    sequenceStep: 1,
    channel: 'EMAIL',
    status: 'SCHEDULED',
    priority: 50,
    toEmail: 'contato@alvo.com.br',
    toDomain: 'alvo.com.br',
    subject: 'Assunto {{businessName}}',
    abVariant: null,
    replayToken: 'tok-1#s1',
    scheduledAt: new Date(Date.now() - 1000),
    dryRun: false,
    metadata: null,
    campaign: CAMPAIGN,
    mailbox: MAILBOX,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  dUpdate.mockResolvedValue({})
  dUpdateMany.mockResolvedValue({ count: 1 })
  dFindFirst.mockResolvedValue(null) // sem bounce recente no dominio
  dCount.mockResolvedValue(0) // cap diario do dominio livre
  mailboxUpdate.mockResolvedValue({})
  stepFindFirst.mockResolvedValue(null)
  leadFindUnique.mockResolvedValue({
    businessName: 'Padaria Central',
    city: 'Campinas',
    state: 'SP',
    niche: 'padaria',
    pitchContent: 'Ola {{businessName}}, posso ajudar com seu site.',
    website: null,
  })
  preflight.mockResolvedValue({ allowed: true, dryRun: false, reasons: [], checks: [] })
  suppression.mockResolvedValue({ available: true, suppressed: false })
  smtpConfig.mockReturnValue({ host: 'smtp', port: 465, secure: true, user: 'u', pass: 'p', fromName: null, fromAddress: 'vendas@dominio.com.br', replyTo: null })
  smtpSend.mockResolvedValue({ messageId: '<mid-1>', smtpResponse: '250 OK', accepted: ['contato@alvo.com.br'], rejected: [] })
})

it('payload invalido lanca PoisonPayloadError (nao re-tenta — task 03)', async () => {
  await expect(runOutreachSend({ foo: 'bar' })).rejects.toBeInstanceOf(PoisonPayloadError)
})

it('dispatch ja processado e no-op (idempotencia)', async () => {
  dFindUnique.mockResolvedValue(makeDispatch({ status: 'SENT' }))
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(dUpdateMany).not.toHaveBeenCalled()
  expect(smtpSend).not.toHaveBeenCalled()
})

it('conflito de claim NAO duplica mensagem (task 08)', async () => {
  dFindUnique.mockResolvedValue(makeDispatch())
  dUpdateMany.mockResolvedValue({ count: 0 }) // outra replica claimou
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(smtpSend).not.toHaveBeenCalled()
  expect(dUpdate).not.toHaveBeenCalled()
})

it('preflight bloqueado (kill switch off) => defer SEM envio e SEM falha hard (tasks 01/11)', async () => {
  dFindUnique.mockResolvedValue(makeDispatch())
  preflight.mockResolvedValue({
    allowed: false,
    dryRun: false,
    reasons: ['kill_switch global desligado'],
    checks: [],
  })
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(smtpSend).not.toHaveBeenCalled()
  const updates = dUpdate.mock.calls.map((c) => c[0].data)
  expect(updates.some((d) => d.status === 'SCHEDULED')).toBe(true)
  expect(updates.some((d) => d.status === 'SENT' || d.status === 'SENDING')).toBe(false)
})

it('janela fechada => defer sem falha hard (task 11)', async () => {
  dFindUnique.mockResolvedValue(
    makeDispatch({ mailbox: { ...MAILBOX, sendWindowStart: '03:00', sendWindowEnd: '03:01' } }),
  )
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(smtpSend).not.toHaveBeenCalled()
  const deferred = dUpdate.mock.calls.find((c) => c[0].data.status === 'SCHEDULED')
  expect(deferred).toBeTruthy()
  expect(deferred![0].data.scheduledAt).toBeInstanceOf(Date)
})

it('endereco suprimido NAO e enviado e gera evento (tasks 07/10)', async () => {
  dFindUnique.mockResolvedValue(makeDispatch())
  suppression.mockResolvedValue({
    available: true,
    suppressed: true,
    kind: 'EMAIL',
    reason: 'UNSUBSCRIBED',
    cooldownUntil: null,
  })
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(smtpSend).not.toHaveBeenCalled()
  expect(outcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'OPT_OUT' }))
  const updates = dUpdate.mock.calls.map((c) => c[0].data)
  expect(updates.some((d) => d.status === 'SUPPRESSED')).toBe(true)
})

it('supressao indisponivel => DRY_RUN (contingencia 9.1): processa sem SMTP real', async () => {
  dFindUnique.mockResolvedValue(makeDispatch())
  suppression.mockResolvedValue({ available: false, suppressed: false })
  preflight.mockResolvedValue({ allowed: true, dryRun: true, reasons: ['supressao indisponivel'], checks: [] })
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(smtpSend).not.toHaveBeenCalled()
  const sent = dUpdate.mock.calls.find((c) => c[0].data.status === 'SENT')
  expect(sent).toBeTruthy()
  expect(sent![0].data.dryRun).toBe(true)
  expect(sent![0].data.messageId).toContain('dry-run')
})

it('sucesso: SENT + ContactEvent SENT + lastSentAt da caixa (task 09)', async () => {
  dFindUnique.mockResolvedValue(makeDispatch())
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(smtpSend).toHaveBeenCalledTimes(1)
  expect(outcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SENT', dispatchId: 'disp-1' }))
  const sent = dUpdate.mock.calls.find((c) => c[0].data.status === 'SENT')
  expect(sent![0].data.messageId).toBe('<mid-1>')
  expect(sent![0].data.contactEventId).toBe('ce-1')
  expect(mailboxUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ lastSentAt: expect.any(Date) }) }),
  )
})

it('proximo passo da sequencia so agenda APOS resultado deste (task 08)', async () => {
  dFindUnique.mockResolvedValue(
    makeDispatch({ campaign: { ...CAMPAIGN, sequenceId: 'seq-1' } }),
  )
  // passo 1 (template) + passo 2 (next) — findFirst e chamado 2x:
  stepFindFirst
    .mockResolvedValueOnce({ stepOrder: 1, channel: 'EMAIL', subjectTemplate: 'Oi {{businessName}}', bodyTemplate: 'corpo', waitHours: 72 })
    .mockResolvedValueOnce({ stepOrder: 2, channel: 'EMAIL', subjectTemplate: null, bodyTemplate: 'follow-up', waitHours: 48 })
  dCreate.mockResolvedValue({ id: 'disp-2' })
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(dCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ sequenceStep: 2, status: 'SCHEDULED', replayToken: 'tok-1#s2' }),
    }),
  )
})

it('erro de rede pos-comando => AMBIGUOUS, nunca re-envio cego (risco 3 do fonte)', async () => {
  dFindUnique.mockResolvedValue(makeDispatch())
  smtpSend.mockRejectedValue(new CodedError('socket hang up', { reasonCode: 'network' }))
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(outcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'AMBIGUOUS' }))
  const updates = dUpdate.mock.calls.map((c) => c[0].data)
  expect(updates.some((d) => d.status === 'AMBIGUOUS')).toBe(true)
  expect(smtpSend).toHaveBeenCalledTimes(1)
})

it('hard bounce => FAILED_PERMANENT + supressao automatica + BOUNCED (task 14)', async () => {
  dFindUnique.mockResolvedValue(makeDispatch())
  smtpSend.mockRejectedValue(
    new CodedError('550 user unknown', { reasonCode: 'suppression', permanent: true }),
  )
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(suppress).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'EMAIL', value: 'contato@alvo.com.br', reason: 'BOUNCED' }),
  )
  expect(outcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'BOUNCED' }))
  const updates = dUpdate.mock.calls.map((c) => c[0].data)
  expect(updates.some((d) => d.status === 'FAILED_PERMANENT')).toBe(true)
})

it('dominio em cooldown pos-bounce => defer (task 14)', async () => {
  dFindUnique.mockResolvedValue(makeDispatch())
  dFindFirst.mockResolvedValue({ updatedAt: new Date() }) // bounce recente no dominio
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(smtpSend).not.toHaveBeenCalled()
  const updates = dUpdate.mock.calls.map((c) => c[0].data)
  expect(updates.some((d) => d.status === 'SCHEDULED')).toBe(true)
})

it('LLM indisponível para gerar pitch => DEFER (não envia, retoma depois)', async () => {
  dFindUnique.mockResolvedValue(makeDispatch({ subject: null }))
  ;(ensureLeadPitch as jest.Mock).mockRejectedValueOnce(new PitchUnavailableError('LLM fora'))
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(smtpSend).not.toHaveBeenCalled()
  const deferred = dUpdate.mock.calls.find((c) => c[0].data.status === 'SCHEDULED')
  expect(deferred).toBeTruthy()
})

it('pitch rejeitado pela anti-alucinação => FAILED_PERMANENT (revisão humana, sem loop)', async () => {
  dFindUnique.mockResolvedValue(makeDispatch({ subject: null }))
  ;(ensureLeadPitch as jest.Mock).mockRejectedValueOnce(new PitchRejectedError('rejeitado', ['sem CTA']))
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(smtpSend).not.toHaveBeenCalled()
  const failed = dUpdate.mock.calls.find((c) => c[0].data.status === 'FAILED_PERMANENT')
  expect(failed).toBeTruthy()
  expect(failed![0].data.reasonCode).toBe('validation')
})

it('lead com reply previo interrompe passo 2 da sequencia (task 13)', async () => {
  dFindUnique.mockResolvedValue(
    makeDispatch({ sequenceStep: 2, campaign: { ...CAMPAIGN, sequenceId: 'seq-1' } }),
  )
  ;(prisma.outreachSequence.findUnique as jest.Mock).mockResolvedValue({ isActive: true, pausedAt: null })
  ;(prisma.contactEvent.findFirst as jest.Mock).mockResolvedValue({ id: 'ce-9', outcome: 'INTERESTED' })
  await runOutreachSend({ dispatchId: 'disp-1' })
  expect(smtpSend).not.toHaveBeenCalled()
  const updates = dUpdate.mock.calls.map((c) => c[0].data)
  expect(updates.some((d) => d.status === 'CANCELLED')).toBe(true)
})
