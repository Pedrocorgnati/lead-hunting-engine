/**
 * Map of deprecated API route prefixes -> deprecation metadata.
 * To mark a route as deprecated, add an entry here and it will automatically
 * receive the X-API-Deprecation header via middleware.
 *
 * Example:
 *   DEPRECATED_ROUTES['/api/v1/legacy-thing'] = { sunsetDate: '2026-12-31' }
 */
export const DEPRECATED_ROUTES: Record<string, { sunsetDate: string; link?: string }> = {
  // Initially empty. Populate when routes are sunset.
}

export function buildDeprecationHeader(sunsetDate: string, link?: string): string {
  const parts = [`sunset=${sunsetDate}`]
  if (link) parts.push(`link="${link}"`)
  return parts.join('; ')
}
