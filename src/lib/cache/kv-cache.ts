// Cache in-memory LRU-bounded.
//
// P-11: o Map era ILIMITADO — em processo longo (next start self-hosted, uma
// coleta grande cacheando milhares de place_ids GMB de 7 dias) crescia sem teto
// e acumulava entradas expiradas. Aqui resolvemos esse risco concreto e
// testavel com bound de tamanho + eviccao LRU/expirados.
//
// NOTA (follow-up de producao): cache persistente/compartilhado entre replicas
// (Redis/Upstash via REDIS_URL) continua pendente — em Vercel serverless cada
// cold start zera este Map, desperdicando quota Google. Requer infra Redis +
// dependencia; nao verificavel neste ambiente.
const MAX_ENTRIES = 5000
const cache = new Map<string, { value: unknown; expiresAt: number }>()

function evictIfNeeded(): void {
  if (cache.size < MAX_ENTRIES) return
  const now = Date.now()
  for (const [k, v] of cache) {
    if (now > v.expiresAt) cache.delete(k)
  }
  // Se ainda no limite, remove os mais antigos (ordem de insercao do Map = LRU).
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  // LRU touch: re-inserir move a chave para o fim (mais recentemente usada).
  cache.delete(key)
  cache.set(key, entry)
  return entry.value as T
}

export async function kvSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  cache.delete(key)
  evictIfNeeded()
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export function kvDelete(key: string): void {
  cache.delete(key)
}
