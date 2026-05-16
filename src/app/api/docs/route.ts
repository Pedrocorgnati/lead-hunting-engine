/**
 * GET /api/docs — Retorna o documento OpenAPI 3.1 em JSON.
 *
 * Cobre: TASK-3/ST003 (CL-613).
 */

import { NextResponse } from 'next/server'
import { generateOpenApiDocument } from '@/lib/openapi/generate'

// Importar path registradores (side-effects registram no registry singleton)
import '@/lib/openapi/paths/auth.paths'
import '@/lib/openapi/paths/leads.paths'
import '@/lib/openapi/paths/jobs.paths'
import '@/lib/openapi/paths/exports.paths'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const spec = generateOpenApiDocument()
  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
