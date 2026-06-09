import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import {
  getApiUsageBreakdown,
  getApiUsageByOperator,
  getCalendarPeriodBounds,
  type ApiUsagePeriod,
} from '@/lib/observability/api-usage-logger'

const VALID_PERIODS: ApiUsagePeriod[] = ['day', 'week', 'month']

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  const raw = typeof v === 'string' ? v : String(v)
  // Neutraliza CSV formula injection: valores iniciando com = + - @ ou
  // tab/CR executam formula ao abrir em Excel/Sheets (email do operador e
  // user-controlled). Prefixa com aspa simples antes do quoting CSV.
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * GET /api/v1/admin/api-usage/export?period=day|week|month
 * Exporta o breakdown de uso (provider x callType + por operador) em CSV.
 * A coluna 'scope' distingue as duas secoes na mesma planilha.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()

    const raw = new URL(request.url).searchParams.get('period') ?? 'month'
    const period: ApiUsagePeriod = (VALID_PERIODS as string[]).includes(raw)
      ? (raw as ApiUsagePeriod)
      : 'month'

    // Periodo calendario (consistente com metrics/projection/budget-alerts):
    // o CSV exportado reconcilia com o que a UI exibe para o mesmo seletor.
    const since = getCalendarPeriodBounds(period).start
    const [byCall, byOperator] = await Promise.all([
      getApiUsageBreakdown({ since }),
      getApiUsageByOperator({ since }),
    ])

    const lines: string[] = ['scope,provider,callType,operator,count,creditTotal']
    for (const r of byCall) {
      lines.push(['provider', r.provider, r.callType, '', r.count, r.creditTotal].map(escapeCsv).join(','))
    }
    for (const o of byOperator) {
      lines.push(['operator', '', '', o.email, o.count, o.creditTotal].map(escapeCsv).join(','))
    }
    const csv = lines.join('\n') + '\n'

    const filename = `api-usage-${period}-${new Date().toISOString().slice(0, 10)}.csv`
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
