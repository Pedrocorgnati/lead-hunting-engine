import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { DEPRECATED_ROUTES, buildDeprecationHeader } from '@/lib/api/deprecation'

// TASK-19 (CL-502, CL-506): MAINTENANCE_MODE gate.
// Ignora: /manutencao, /api/health (health check deve continuar respondendo),
// e assets estaticos (ja filtrados pelo matcher).
const MAINTENANCE_EXEMPT = [
  '/manutencao',
  '/api/health',
]

function isMaintenanceExempt(pathname: string): boolean {
  return MAINTENANCE_EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

// TASK-18/ST006 (CL-348): correlation-id — injeta se ausente, propaga no
// request e na response para todos os layers (Sentry, logs, fetch encadeados).
function ensureCorrelationId(request: NextRequest): string {
  const existing = request.headers.get('x-correlation-id')
  if (existing && existing.length <= 100) return existing
  return crypto.randomUUID()
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const correlationId = ensureCorrelationId(request)

  if (process.env.MAINTENANCE_MODE === 'true' && !isMaintenanceExempt(pathname)) {
    // API: responde 503 JSON. Pagina: redireciona para /manutencao.
    if (pathname.startsWith('/api/')) {
      const res = NextResponse.json(
        {
          error: {
            code: 'MAINTENANCE_MODE',
            message: 'Estamos em manutenção. Voltamos em instantes.',
          },
        },
        {
          status: 503,
          headers: { 'Retry-After': '300' },
        },
      )
      res.headers.set('x-correlation-id', correlationId)
      return res
    }
    const url = request.nextUrl.clone()
    url.pathname = '/manutencao'
    const res = NextResponse.rewrite(url, { status: 503 })
    res.headers.set('Retry-After', '300')
    res.headers.set('x-correlation-id', correlationId)
    return res
  }

  const response = await updateSession(request)
  response.headers.set('x-correlation-id', correlationId)

  // CL-468: inject X-API-Deprecation for deprecated routes
  for (const [prefix, meta] of Object.entries(DEPRECATED_ROUTES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      response.headers.set('X-API-Deprecation', buildDeprecationHeader(meta.sunsetDate, meta.link))
      break
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
