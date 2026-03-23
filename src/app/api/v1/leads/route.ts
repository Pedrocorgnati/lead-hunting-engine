import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'
import { leadService } from '@/services/lead.service'
import { LeadListQuerySchema } from '@/schemas/lead.schema'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)

    const query = LeadListQuerySchema.parse(Object.fromEntries(searchParams))
    const { data, total } = await leadService.findAll(user.id, query)

    return paginatedResponse(data, { page: query.page, limit: query.limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}
