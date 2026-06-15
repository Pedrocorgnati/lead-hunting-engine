/**
 * outreach-engine (brainstorm 06-10, task 04): taxonomia canonica de motivo
 * de falha para jobs/envios. Toda falha critica registrada em fila, telemetria
 * ou AuditLog carrega um reason_code NAO NULO desta lista — incidentes de
 * suporte filtram por ele.
 *
 * `permanent` distingue poison (payload/regra irrecuperavel — NUNCA re-tentar,
 * task 03) de falha transitoria (network/provider — retry com backoff).
 */

export const REASON_CODES = [
  'auth',
  'provider',
  'validation',
  'suppression',
  'idempotency',
  'inbox_parse',
  'network',
  'unknown',
] as const

export type ReasonCode = (typeof REASON_CODES)[number]

export function isReasonCode(value: unknown): value is ReasonCode {
  return typeof value === 'string' && (REASON_CODES as readonly string[]).includes(value)
}

/**
 * Erro com reason code + flag de permanencia. Handlers da fila local lancam
 * CodedError para controlar retry: permanent=true vai direto para FAILED
 * (poison queue) sem novas tentativas.
 */
export class CodedError extends Error {
  readonly reasonCode: ReasonCode
  readonly permanent: boolean

  constructor(
    message: string,
    options: { reasonCode: ReasonCode; permanent?: boolean; cause?: unknown } = {
      reasonCode: 'unknown',
    },
  ) {
    super(message)
    this.name = 'CodedError'
    this.reasonCode = options.reasonCode
    this.permanent = options.permanent === true
    if (options.cause !== undefined) {
      ;(this as { cause?: unknown }).cause = options.cause
    }
  }
}

/** Poison: payload estruturalmente invalido — irrecuperavel por retry. */
export class PoisonPayloadError extends CodedError {
  constructor(message: string, cause?: unknown) {
    super(message, { reasonCode: 'validation', permanent: true, cause })
    this.name = 'PoisonPayloadError'
  }
}

const NETWORK_PATTERNS =
  /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EPIPE|socket hang up|fetch failed|network|timeout)\b/i
const AUTH_PATTERNS =
  /\b(401|403|unauthorized|forbidden|invalid[ _-]?credentials?|auth(entication|orization)? (failed|error)|EAUTH|invalid login|senha|password)\b/i
const PROVIDER_PATTERNS =
  /\b(429|rate limit|quota|5\d\d|provider|upstream|service unavailable|too many requests)\b/i
const VALIDATION_PATTERNS =
  /\b(zod|invalid payload|validation|parse error|malformed|schema|required field)\b/i
const SUPPRESSION_PATTERNS = /\b(suppress(ed|ion)?|opt[ -]?out|unsubscribe|blocklist|bounce)\b/i
const IDEMPOTENCY_PATTERNS = /\b(P2002|duplicate|replay|idempoten|already (sent|processed|claimed)|unique constraint)\b/i
const INBOX_PATTERNS = /\b(imap|inbound|mailparser|mime|inbox)\b/i

/**
 * Classificacao heuristica de erro arbitrario -> reason code. CodedError
 * preserva o codigo explicito; o resto cai na cascata de padroes (ordem
 * importa: auth antes de provider, suppression antes de network).
 */
export function classifyError(err: unknown): ReasonCode {
  if (err instanceof CodedError) return err.reasonCode
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  if (AUTH_PATTERNS.test(msg)) return 'auth'
  if (SUPPRESSION_PATTERNS.test(msg)) return 'suppression'
  if (IDEMPOTENCY_PATTERNS.test(msg)) return 'idempotency'
  if (INBOX_PATTERNS.test(msg)) return 'inbox_parse'
  if (VALIDATION_PATTERNS.test(msg)) return 'validation'
  if (NETWORK_PATTERNS.test(msg)) return 'network'
  if (PROVIDER_PATTERNS.test(msg)) return 'provider'
  return 'unknown'
}

export function isPermanentError(err: unknown): boolean {
  return err instanceof CodedError && err.permanent
}
