/**
 * outreach-engine (06-10, task 04): taxonomia de reason-code.
 * Aceite: toda falha critica registra reason_code nao nulo e filtravel.
 */
import {
  classifyError,
  CodedError,
  PoisonPayloadError,
  isPermanentError,
  isReasonCode,
} from '../reason-codes'

describe('classifyError', () => {
  it('preserva o codigo explicito de CodedError', () => {
    expect(classifyError(new CodedError('x', { reasonCode: 'suppression' }))).toBe('suppression')
  })

  it.each([
    [new Error('connect ECONNREFUSED 127.0.0.1:587'), 'network'],
    [new Error('socket hang up'), 'network'],
    [new Error('401 Unauthorized'), 'auth'],
    [new Error('Invalid login: 535 authentication failed'), 'auth'],
    [new Error('429 rate limit exceeded by provider'), 'provider'],
    [new Error('zod validation failed: invalid payload'), 'validation'],
    [new Error('endereco em suppression list'), 'suppression'],
    [new Error('unique constraint P2002 duplicate'), 'idempotency'],
    [new Error('imap connection dropped'), 'inbox_parse'],
    [new Error('algo completamente inesperado'), 'unknown'],
  ])('classifica %p como %s', (err, expected) => {
    expect(classifyError(err)).toBe(expected)
  })

  it('nunca retorna nulo/vazio — fallback unknown', () => {
    expect(isReasonCode(classifyError(undefined))).toBe(true)
    expect(isReasonCode(classifyError('string error'))).toBe(true)
  })
})

describe('permanencia (poison, task 03)', () => {
  it('PoisonPayloadError e permanente com reason validation', () => {
    const err = new PoisonPayloadError('payload invalido')
    expect(isPermanentError(err)).toBe(true)
    expect(err.reasonCode).toBe('validation')
  })

  it('CodedError default nao e permanente (retriable)', () => {
    expect(isPermanentError(new CodedError('x', { reasonCode: 'network' }))).toBe(false)
  })

  it('erro generico nao e permanente', () => {
    expect(isPermanentError(new Error('x'))).toBe(false)
  })
})
