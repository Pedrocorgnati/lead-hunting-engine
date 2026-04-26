// In-memory cache fallback (use Redis/Upstash in production via env REDIS_URL)
const cache = new Map<string, { value: unknown; expiresAt: number }>()

export async function kvGet<T>(key: string): Promise<T | null> {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value as T
}

export async function kvSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export function kvDelete(key: string): void {
  cache.delete(key)
}
