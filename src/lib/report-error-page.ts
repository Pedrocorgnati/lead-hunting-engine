/**
 * Reporta uma pagina de erro dedicada (403/429) ao endpoint canonico
 * `POST /api/v1/errors/report` no mount.
 *
 * Payload congruente com o schema strict do endpoint
 * (`src/app/api/v1/errors/report/route.ts`): correlationId + boundary +
 * pathname + userAgent + occurredAt. Mesmo contrato usado por
 * `components/errors/error-experience.tsx` (paginas 404/500). O payload
 * "statusCode/path/timestamp" descrito na task original seria rejeitado
 * pelo `.strict()` do endpoint, por isso seguimos o contrato real.
 *
 * Tratamento de falha por ambiente: em desenvolvimento loga via
 * `console.error`; em producao suprime silenciosamente para nao poluir a UX
 * de uma pagina que ja esta em estado de erro.
 */
export async function reportErrorPage(boundary: string): Promise<void> {
  if (typeof window === 'undefined') return

  const correlationId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

  try {
    const response = await fetch('/api/v1/errors/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        correlationId,
        boundary,
        pathname: window.location.pathname,
        userAgent: navigator.userAgent,
        occurredAt: new Date().toISOString(),
      }),
    })
    if (!response.ok && process.env.NODE_ENV === 'development') {
      console.error(`[error-page-report] ${boundary}: endpoint respondeu ${response.status}`)
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[error-page-report] ${boundary}: falha ao reportar`, err)
    }
  }
}
