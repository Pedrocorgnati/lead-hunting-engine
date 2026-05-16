import * as Sentry from '@sentry/nextjs'
import { kvGet, kvSet } from './kv-cache'

const DEFAULT_THRESHOLD = 0.95
const CACHE_TTL_MS = 60 * 60 * 24 * 1000

/**
 * Semantic hash for LLM prompt deduplication.
 *
 * Strategy: normalize prompt text -> sha-256 exact hash first;
 * falling back to embedding-based bucket (if provider available).
 * For MVP, uses exact hash only (embedding requires pgvector or similar).
 */
export async function semanticHash(
  prompt: string,
  opts?: { threshold?: number },
): Promise<string> {
  const normalized = prompt.trim().toLowerCase().replace(/\s+/g, ' ')
  const encoder = new TextEncoder()
  const data = encoder.encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hexHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  const METRIC_KEY = 'llm.cache.semantic_hit_ratio'

  // Check cache
  const cached = await kvGet<string>(`semantic:${hexHash}`)
  if (cached) {
    Sentry.metrics?.increment(METRIC_KEY, 1, { tags: { hit: 'true' } })
    return hexHash
  }

  // Store for future lookups
  await kvSet(`semantic:${hexHash}`, hexHash, CACHE_TTL_MS)
  Sentry.metrics?.increment(METRIC_KEY, 1, { tags: { hit: 'false' } })

  void opts?.threshold // reserved for embedding-based similarity (pgvector phase 2)

  return hexHash
}

/** Check if a prompt result is cached by its semantic hash. */
export async function getSemanticCached<T>(prompt: string): Promise<T | null> {
  const hash = await semanticHash(prompt)
  return kvGet<T>(`semantic-result:${hash}`)
}

/** Store result keyed by semantic hash of the prompt. */
export async function setSemanticCached<T>(
  prompt: string,
  result: T,
  ttlMs = CACHE_TTL_MS,
): Promise<void> {
  const hash = await semanticHash(prompt, { threshold: DEFAULT_THRESHOLD })
  await kvSet(`semantic-result:${hash}`, result, ttlMs)
}
