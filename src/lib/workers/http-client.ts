/**
 * HTTP client com proxy pool + fingerprint rotativo + rate limit + backoff.
 *
 * Origem: TASK-12 intake-review / ST002 (CL-189).
 *
 * Quando `PROXY_POOL_JSON` (ou legado `RESIDENTIAL_PROXY_POOL`) esta preenchido,
 * o client roteia requisicoes pelo `ProxyPool` round-robin com quarentena
 * automatica apos falhas consecutivas. Caso contrario, cai para `fetch`
 * direto — mantendo o fluxo funcional em dev/local sem exigir proxy.
 *
 * Todas as requisicoes sao instrumentadas com fingerprint rotativo (UA,
 * viewport, accept-language) para reduzir deteccao por heuristicas triviais.
 */

import { ProxyPool, type ProxyConfig } from './providers/proxy-pool'
import { nextFingerprint, fingerprintHeaders } from './fingerprint'
import { captureException } from '@/lib/observability/sentry'

export interface HttpClientOptions {
  /** Rate limit (req/s). Default 2. */
  requestsPerSecond?: number
  /** Max retries em caso de 429/5xx ou network error. Default 3. */
  maxRetries?: number
  /** Timeout por request em ms. Default 15s. */
  timeoutMs?: number
  /** Habilita proxy pool. Default true (controlado por env). */
  useProxy?: boolean
  /** Headers extras para mesclar apos fingerprint. */
  headers?: Record<string, string>
}

export interface HttpResponse {
  ok: boolean
  status: number
  text: string
  url: string
  headers: Headers
}

const DEFAULTS: Required<Omit<HttpClientOptions, 'headers'>> = {
  requestsPerSecond: 2,
  maxRetries: 3,
  timeoutMs: 15_000,
  useProxy: true,
}

/**
 * Cria um HttpClient com proxy pool lido de env `PROXY_POOL_JSON` / `RESIDENTIAL_PROXY_POOL`.
 * Formato: JSON array de `{host, port, user?, pass?}`.
 */
export class HttpClient {
  private readonly pool: ProxyPool
  private readonly options: Required<Omit<HttpClientOptions, 'headers'>> & {
    headers?: Record<string, string>
  }
  private lastRequestAt = 0

  constructor(options: HttpClientOptions = {}, pool?: ProxyPool) {
    this.options = { ...DEFAULTS, ...options }
    this.pool = pool ?? ProxyPool.fromEnv()
  }

  private minIntervalMs(): number {
    return Math.max(1, Math.floor(1000 / this.options.requestsPerSecond))
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt
    const wait = this.minIntervalMs() - elapsed
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.lastRequestAt = Date.now()
  }

  private async backoff(attempt: number): Promise<void> {
    const base = Math.min(2 ** attempt * 500, 8_000)
    const jitter = Math.random() * 300
    await new Promise((r) => setTimeout(r, base + jitter))
  }

  async fetch(url: string, init: RequestInit = {}): Promise<HttpResponse> {
    let lastError: unknown = null
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      await this.throttle()
      const fp = nextFingerprint()
      const proxy = this.options.useProxy ? this.pool.next() : null
      const headers = new Headers({
        ...fingerprintHeaders(fp),
        ...(this.options.headers ?? {}),
        ...(init.headers as Record<string, string> | undefined),
      })

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs)
      try {
        const fetchInit: RequestInit & { dispatcher?: unknown } = {
          ...init,
          headers,
          signal: controller.signal,
        }

        // undici Agent with proxy — dynamic import mantem compat edge runtime.
        // undici e opcional: se nao instalado, proxy e ignorado (fallback seguro).
        if (proxy) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const undici = await (eval('import("undici")') as Promise<any>).catch(() => null)
            if (undici && typeof (undici as { ProxyAgent?: unknown }).ProxyAgent === 'function') {
              const ProxyAgent = (undici as unknown as { ProxyAgent: new (url: string) => unknown }).ProxyAgent
              fetchInit.dispatcher = new ProxyAgent(this.pool.toUrl(proxy))
            }
          } catch {
            // Se undici nao estiver disponivel, segue sem proxy (fallback seguro)
          }
        }

        const res = await fetch(url, fetchInit)
        const text = await res.text()
        clearTimeout(timer)

        if (!res.ok) {
          if (res.status === 429 || res.status >= 500) {
            this.pool.reportFailure(proxy, `http-${res.status}`)
            if (attempt < this.options.maxRetries) {
              await this.backoff(attempt)
              continue
            }
          }
        } else {
          this.pool.reportSuccess(proxy ?? { host: '_direct', port: 0 })
        }

        return {
          ok: res.ok,
          status: res.status,
          text,
          url: res.url,
          headers: res.headers,
        }
      } catch (err) {
        clearTimeout(timer)
        lastError = err
        this.pool.reportFailure(proxy, err instanceof Error ? err.message : 'unknown')
        if (attempt < this.options.maxRetries) {
          await this.backoff(attempt)
          continue
        }
      }
    }

    const finalError = lastError instanceof Error ? lastError : new Error('http-client: all retries exhausted')
    captureException(finalError, { layer: 'http-client', url })
    throw finalError
  }

  /** Retorna estatisticas atuais do proxy pool (util para dashboards). */
  proxyStatus() {
    return this.pool.status()
  }
}

// Singleton de conveniencia
let _default: HttpClient | null = null
export function getHttpClient(options?: HttpClientOptions): HttpClient {
  if (!_default) _default = new HttpClient(options)
  return _default
}

export function resetHttpClient(): void {
  _default = null
}

export type { ProxyConfig }
