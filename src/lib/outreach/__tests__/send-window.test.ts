/**
 * outreach-engine (06-10, task 11): janela de envio timezone-aware,
 * jitter deterministico e gap minimo — funcoes puras.
 */
import {
  isWithinSendWindow,
  nextWindowOpen,
  deterministicJitterMs,
  computeSendAt,
  minutesInTimezone,
} from '../send-window'

// 2026-06-10T15:00:00Z = 12:00 em America/Sao_Paulo (UTC-3)
const NOON_SP = new Date('2026-06-10T15:00:00Z')
// 2026-06-10T01:00:00Z = 22:00 do dia 09 em America/Sao_Paulo
const NIGHT_SP = new Date('2026-06-10T01:00:00Z')

const WINDOW = { start: '09:00', end: '18:00', timezone: 'America/Sao_Paulo' }

describe('isWithinSendWindow', () => {
  it('aberta dentro do horario comercial no fuso da caixa', () => {
    expect(isWithinSendWindow(WINDOW, NOON_SP)).toBe(true)
  })

  it('fechada fora do horario (22:00 local)', () => {
    expect(isWithinSendWindow(WINDOW, NIGHT_SP)).toBe(false)
  })

  it('suporta janela invertida atravessando a meia-noite', () => {
    const inverted = { start: '20:00', end: '06:00', timezone: 'America/Sao_Paulo' }
    expect(isWithinSendWindow(inverted, NIGHT_SP)).toBe(true)
    expect(isWithinSendWindow(inverted, NOON_SP)).toBe(false)
  })

  it('spec invalida = janela FECHADA (fail-safe, nunca envia)', () => {
    expect(isWithinSendWindow({ start: '25:00', end: '18:00', timezone: 'America/Sao_Paulo' }, NOON_SP)).toBe(false)
    expect(isWithinSendWindow({ start: '09:00', end: '18:00', timezone: 'Fuso/Inexistente' }, NOON_SP)).toBe(false)
    expect(isWithinSendWindow({ start: '09:00', end: '09:00', timezone: 'America/Sao_Paulo' }, NOON_SP)).toBe(false)
  })
})

describe('nextWindowOpen', () => {
  it('retorna o proprio instante quando a janela ja esta aberta', () => {
    expect(nextWindowOpen(WINDOW, NOON_SP)).toEqual(NOON_SP)
  })

  it('avanca para a proxima abertura quando fechada', () => {
    const next = nextWindowOpen(WINDOW, NIGHT_SP)
    expect(next.getTime()).toBeGreaterThan(NIGHT_SP.getTime())
    expect(isWithinSendWindow(WINDOW, next)).toBe(true)
  })
})

describe('deterministicJitterMs', () => {
  it('mesma chave => mesmo jitter (reprodutivel em retry)', () => {
    expect(deterministicJitterMs('token-a', 60)).toBe(deterministicJitterMs('token-a', 60))
  })

  it('chaves distintas tendem a jitter distinto e dentro do teto', () => {
    const a = deterministicJitterMs('token-a', 60)
    const b = deterministicJitterMs('token-b', 60)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(60_000)
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThanOrEqual(60_000)
  })

  it('jitter zero quando maxJitterSeconds <= 0', () => {
    expect(deterministicJitterMs('token-a', 0)).toBe(0)
  })
})

describe('computeSendAt', () => {
  it('respeita gap minimo desde o ultimo envio da caixa', () => {
    const lastSentAt = new Date(NOON_SP.getTime() - 30_000) // 30s atras
    const sendAt = computeSendAt({
      window: WINDOW,
      lastSentAt,
      minGapSeconds: 90,
      jitterSeconds: 0,
      jitterKey: 'k',
      now: NOON_SP,
    })
    expect(sendAt.getTime()).toBeGreaterThanOrEqual(lastSentAt.getTime() + 90_000)
  })

  it('fora da janela empurra para a proxima abertura', () => {
    const sendAt = computeSendAt({
      window: WINDOW,
      lastSentAt: null,
      minGapSeconds: 0,
      jitterSeconds: 0,
      jitterKey: 'k',
      now: NIGHT_SP,
    })
    expect(isWithinSendWindow(WINDOW, sendAt)).toBe(true)
  })
})

describe('minutesInTimezone', () => {
  it('converte para o fuso correto', () => {
    expect(minutesInTimezone(NOON_SP, 'America/Sao_Paulo')).toBe(12 * 60)
    expect(minutesInTimezone(NOON_SP, 'UTC')).toBe(15 * 60)
  })
})
