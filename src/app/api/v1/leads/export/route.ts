import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { leadService } from '@/services/lead.service'
import { prisma } from '@/lib/prisma'
import { LeadListQuerySchema } from '@/schemas/lead.schema'
import { AuditService } from '@/lib/services/audit-service'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') === 'json' ? 'json' : 'csv'
    const query = LeadListQuerySchema.parse(Object.fromEntries(searchParams))

    const date = new Date().toISOString().slice(0, 10)

    await AuditService.log({
      userId: user.id,
      action: 'lead.exported',
      resource: 'lead',
      metadata: { format, filters: JSON.stringify(query) },
    })

    if (format === 'json') {
      const where: Record<string, unknown> = { userId: user.id }
      if (query.status) where.status = query.status
      if (query.temperature) where.temperature = query.temperature
      if (query.city) where.city = { contains: query.city, mode: 'insensitive' }
      if (query.niche) where.category = { contains: query.niche, mode: 'insensitive' }

      const leads = await prisma.lead.findMany({
        where,
        orderBy: { score: 'desc' },
        take: Math.min(query.limit ?? 1000, 1000),
      })

      return new NextResponse(JSON.stringify(leads, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="leads-export-${date}.json"`,
        },
      })
    }

    const csv = await leadService.exportCsv(user.id, query)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-export-${date}.csv"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
