/**
 * Timeouts canonicos para fetches de provider (H-03/H-04).
 *
 * Sem AbortSignal um fetch pode pendurar indefinidamente; como searchBusinesses
 * itera os providers em SEQUENCIA (provider-manager PROVIDER_ORDER), um hang
 * trava o cascade inteiro e esgota o worker pool. Referencia: fetchGmb
 * (google-my-business.ts) ja usa AbortSignal.timeout(15s).
 */

/** Busca/detalhe de providers (Google TextSearch, Outscraper, Apify start, social search). */
export const PROVIDER_FETCH_TIMEOUT_MS = 15_000

/** Google Places TextSearch — rapido; timeout mais curto. */
export const TEXTSEARCH_TIMEOUT_MS = 10_000

/** Fetches de POLLING (Apify/PhantomBuster run-status, dataset) — curtos e frequentes. */
export const POLL_TIMEOUT_MS = 10_000

/** Helper conveniente: `fetch(url, withTimeout())` ou mesclar em opts existentes. */
export function abortAfter(ms: number): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(ms) }
}
