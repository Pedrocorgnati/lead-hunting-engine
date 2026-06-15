/**
 * outreach-engine (brainstorm 06-10, task 11 — F-11): janela de envio
 * timezone-aware + jitter + gap minimo por caixa. Funcoes PURAS (testaveis
 * sem banco); o worker e o scheduler consomem.
 */

export interface SendWindowSpec {
  /** "HH:MM" no fuso da caixa. */
  start: string
  /** "HH:MM" no fuso da caixa. */
  end: string
  /** IANA timezone, ex. "America/Sao_Paulo". */
  timezone: string
}

function parseHHMM(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Minutos desde 00:00 no fuso dado, para o instante `now`. */
export function minutesInTimezone(now: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

/**
 * Janela aberta agora? Janela invertida (ex. 22:00->06:00) e suportada.
 * Spec invalida = janela FECHADA (fail-safe: nao envia).
 */
export function isWithinSendWindow(spec: SendWindowSpec, now: Date = new Date()): boolean {
  const start = parseHHMM(spec.start)
  const end = parseHHMM(spec.end)
  if (start === null || end === null) return false
  let current: number
  try {
    current = minutesInTimezone(now, spec.timezone)
  } catch {
    return false
  }
  if (start === end) return false
  if (start < end) return current >= start && current < end
  // Janela atravessa a meia-noite.
  return current >= start || current < end
}

/**
 * Proximo instante em que a janela abre (>= now). Se ja aberta, retorna now.
 * Aproximacao por passos de 15min (sem dependencia de lib de tz) limitada a
 * 48h — depois disso devolve now + 24h como fallback defensivo.
 */
export function nextWindowOpen(spec: SendWindowSpec, now: Date = new Date()): Date {
  if (isWithinSendWindow(spec, now)) return now
  const STEP_MS = 15 * 60 * 1000
  for (let i = 1; i <= (48 * 60) / 15; i++) {
    const candidate = new Date(now.getTime() + i * STEP_MS)
    if (isWithinSendWindow(spec, candidate)) return candidate
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000)
}

/**
 * Jitter deterministico por chave (replayToken): evita cadencia robotizada
 * sem perder reprodutibilidade em retry (mesmo dispatch => mesmo jitter).
 */
export function deterministicJitterMs(key: string, maxJitterSeconds: number): number {
  if (maxJitterSeconds <= 0) return 0
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return (hash % (maxJitterSeconds * 1000 + 1))
}

/**
 * Calcula o instante de envio respeitando: janela aberta, gap minimo desde o
 * ultimo envio da caixa e jitter deterministico.
 */
export function computeSendAt(params: {
  window: SendWindowSpec
  lastSentAt: Date | null
  minGapSeconds: number
  jitterSeconds: number
  jitterKey: string
  now?: Date
}): Date {
  const now = params.now ?? new Date()
  const gapFloor = params.lastSentAt
    ? new Date(params.lastSentAt.getTime() + params.minGapSeconds * 1000)
    : now
  const base = gapFloor > now ? gapFloor : now
  const withJitter = new Date(
    base.getTime() + deterministicJitterMs(params.jitterKey, params.jitterSeconds),
  )
  return nextWindowOpen(params.window, withJitter)
}
