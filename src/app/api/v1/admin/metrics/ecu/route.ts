import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { buildEcuReport, ecuReportToCsv } from '@/lib/metrics/ecu-report'

/**
 * GET /api/v1/admin/metrics/ecu[?days=7|30&format=json|csv] (C14.4 / item 071)
 *
 * Relatorio ECU agregado: eventos de telemetria por fluxo (kind), severidade,
 * usuario, rota, provider e dia. `format=csv` baixa o export. RBAC: ADMIN.
 * Consumido pela secao ECU de /admin/metricas.
 */
const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  format: z.enum(['json', 'csv']).default('json'),
})

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const q = QuerySchema.parse({
      days: searchParams.get('days') ?? undefined,
      format: searchParams.get('format') ?? undefined,
    })

    const report = await buildEcuReport(q.days)

    if (q.format === 'csv') {
      return new NextResponse(ecuReportToCsv(report), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="ecu-report-${q.days}d.csv"`,
        },
      })
    }

    return successResponse(report)
  } catch (error) {
    return handleApiError(error)
  }
}
