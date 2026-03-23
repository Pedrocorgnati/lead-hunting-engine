import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { leadService } from '@/services/lead.service'
import { LeadListQuerySchema } from '@/schemas/lead.schema'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const query = LeadListQuerySchema.parse(Object.fromEntries(searchParams))

    const csv = await leadService.exportCsv(user.id, query)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
