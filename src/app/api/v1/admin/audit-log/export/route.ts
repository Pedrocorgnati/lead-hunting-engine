import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { AuditService } from '@/lib/services/audit-service'
import { buildAuditLogQuery } from '@/app/api/v1/admin/audit-log/route'

const CSV_HEADERS = [
  'id',
  'createdAt',
  'action',
  'resource',
  'resourceId',
  'userId',
  'userEmail',
  'userName',
  'ipAddress',
  'correlationId',
  'metadata',
]

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

/**
 * GET /api/v1/admin/audit-log/export
 *
 * Reusa os mesmos filtros do listagem. Retorna CSV em streaming.
 * Limite defensivo: 10 000 linhas (evita OOM / lambda timeout).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const { where } = buildAuditLogQuery(request.url)

    const total = await prisma.auditLog.count({ where })
    const MAX_ROWS = 10_000
    const capped = Math.min(total, MAX_ROWS)

    const encoder = new TextEncoder()
    const batchSize = 500

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(CSV_HEADERS.join(',') + '\n'))

        let skip = 0
        while (skip < capped) {
          const take = Math.min(batchSize, capped - skip)
          const rows = await prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take,
            select: {
              id: true,
              createdAt: true,
              action: true,
              resource: true,
              resourceId: true,
              userId: true,
              ipAddress: true,
              metadata: true,
              user: { select: { email: true, name: true } },
            },
          })

          for (const row of rows) {
            const metadata = (row.metadata ?? null) as Record<string, unknown> | null
            const correlationId =
              metadata && typeof metadata === 'object' && 'correlationId' in metadata
                ? String((metadata as Record<string, unknown>).correlationId ?? '')
                : ''

            const line = [
              row.id,
              row.createdAt.toISOString(),
              row.action,
              row.resource,
              row.resourceId ?? '',
              row.userId ?? '',
              row.user?.email ?? '',
              row.user?.name ?? '',
              row.ipAddress ?? '',
              correlationId,
              metadata ? JSON.stringify(metadata) : '',
            ]
              .map(escapeCsv)
              .join(',')
            controller.enqueue(encoder.encode(line + '\n'))
          }

          skip += rows.length
          if (rows.length < take) break
        }

        controller.close()
      },
    })

    await AuditService.log({
      userId: user.id,
      action: 'audit_log.exported',
      resource: 'audit_log',
      metadata: {
        rows: capped,
        truncated: total > MAX_ROWS,
        total,
      },
    })

    const filename = `audit-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
    return new NextResponse(stream, {
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
