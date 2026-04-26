/**
 * Circuit breaker em memoria por chave (provider:tenant).
 *
 * Estados:
 *  - CLOSED: chamadas passam normalmente.
 *  - OPEN: chamadas sao rejeitadas com `CircuitOpenError` ate expirar `openUntil`.
 *  - HALF_OPEN: primeira chamada apos expirar a janela OPEN e permitida.
 *    Se tiver sucesso volta para CLOSED; se falhar, reabre por `openMs`.
 *
 * Reuso compartilhado: providers do mesmo grupo (ex: social IG) passam a mesma
 * chave para compartilhar o mesmo breaker e evitar retry entre fallbacks quando
 * o tenant ja esgotou a quota upstream.
 */

export interface CircuitBreakerConfig {
  failureThreshold: number
  openMs: number
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  openMs: 5 * 60 * 1000, // 5 minutos
}

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

interface BreakerEntry {
  state: State
  failures: number
  openUntil: number
}

export class CircuitOpenError extends Error {
  constructor(public readonly key: string, public readonly retryAfterMs: number) {
    super(`CIRCUIT_OPEN: ${key} (retry em ${Math.ceil(retryAfterMs / 1000)}s)`)
    this.name = 'CircuitOpenError'
  }
}

const breakers = new Map<string, BreakerEntry>()

function getEntry(key: string): BreakerEntry {
  let e = breakers.get(key)
  if (!e) {
    e = { state: 'CLOSED', failures: 0, openUntil: 0 }
    breakers.set(key, e)
  }
  return e
}

export const CircuitBreaker = {
  /**
   * Registra falha. Abre o circuito se atingir threshold.
   */
  recordFailure(key: string, config: Partial<CircuitBreakerConfig> = {}): void {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const e = getEntry(key)
    e.failures += 1
    if (e.state === 'HALF_OPEN' || e.failures >= cfg.failureThreshold) {
      e.state = 'OPEN'
      e.openUntil = Date.now() + cfg.openMs
    }
  },

  /**
   * Registra sucesso: reseta contadores e volta a CLOSED.
   */
  recordSuccess(key: string): void {
    const e = getEntry(key)
    e.failures = 0
    e.openUntil = 0
    e.state = 'CLOSED'
  },

  /**
   * Antes de chamar upstream: lanca se OPEN. Transita OPEN -> HALF_OPEN se
   * janela expirou, permitindo 1 probe.
   */
  ensureClosed(key: string): void {
    const e = getEntry(key)
    if (e.state !== 'OPEN') return
    if (Date.now() >= e.openUntil) {
      e.state = 'HALF_OPEN'
      return
    }
    throw new CircuitOpenError(key, e.openUntil - Date.now())
  },

  /** Estado atual (para logs e testes). */
  inspect(key: string): Readonly<BreakerEntry> {
    return getEntry(key)
  },

  /** Limpa estado de uma chave (usado em testes). */
  reset(key?: string): void {
    if (key) breakers.delete(key)
    else breakers.clear()
  },
}
