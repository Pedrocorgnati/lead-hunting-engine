const QUARANTINE_MS = 60 * 60 * 1000 // 1h
const FAIL_THRESHOLD = 5

export interface ProxyConfig {
  host: string
  port: number
  user?: string
  pass?: string
}

interface ProxyState extends ProxyConfig {
  failures: number
  quarantinedUntil: number | null
}

export class ProxyPool {
  private proxies: ProxyState[]
  private cursor = 0

  constructor(configs: ProxyConfig[]) {
    this.proxies = configs.map(c => ({ ...c, failures: 0, quarantinedUntil: null }))
  }

  static fromEnv(): ProxyPool {
    const raw = process.env.RESIDENTIAL_PROXY_POOL
    if (!raw) return new ProxyPool([])
    try {
      const configs = JSON.parse(raw) as ProxyConfig[]
      return new ProxyPool(Array.isArray(configs) ? configs : [])
    } catch {
      return new ProxyPool([])
    }
  }

  healthy(): ProxyState[] {
    const now = Date.now()
    return this.proxies.filter(
      p => p.quarantinedUntil === null || p.quarantinedUntil < now
    )
  }

  next(): ProxyState | null {
    const pool = this.healthy()
    if (pool.length === 0) return null
    const proxy = pool[this.cursor % pool.length]
    this.cursor = (this.cursor + 1) % pool.length
    return proxy
  }

  toUrl(proxy: ProxyConfig): string {
    if (proxy.user && proxy.pass) {
      return `http://${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}`
    }
    return `http://${proxy.host}:${proxy.port}`
  }

  reportSuccess(proxy: ProxyConfig): void {
    const state = this.proxies.find(p => p.host === proxy.host && p.port === proxy.port)
    if (!state) return
    state.failures = 0
    state.quarantinedUntil = null
  }

  reportFailure(proxy: ProxyConfig | null, reason: string): void {
    if (!proxy) return
    const state = this.proxies.find(p => p.host === proxy.host && p.port === proxy.port)
    if (!state) return
    state.failures++
    if (state.failures >= FAIL_THRESHOLD) {
      state.quarantinedUntil = Date.now() + QUARANTINE_MS
      // NOTE: AuditLog insertion happens in the caller (API layer) to avoid prisma import
      console.warn(`[proxy-pool] Proxy ${state.host}:${state.port} quarantined — reason: ${reason}`)
    }
  }

  status(): { total: number; healthy: number; quarantined: Array<{ host: string; port: number; until: string }> } {
    const now = Date.now()
    const quarantined = this.proxies
      .filter(p => p.quarantinedUntil !== null && p.quarantinedUntil > now)
      .map(p => ({ host: p.host, port: p.port, until: new Date(p.quarantinedUntil!).toISOString() }))

    return {
      total: this.proxies.length,
      healthy: this.healthy().length,
      quarantined,
    }
  }
}

// Singleton para uso nos workers
let _pool: ProxyPool | null = null

export function getProxyPool(): ProxyPool {
  if (!_pool) _pool = ProxyPool.fromEnv()
  return _pool
}

export function resetProxyPool(): void {
  _pool = null
}
