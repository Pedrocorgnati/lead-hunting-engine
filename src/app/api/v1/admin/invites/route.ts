import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse, paginatedResponse } from '@/lib/api-utils'
import { inviteService } from '@/services/invite.service'
import { CreateInviteSchema } from '@/schemas/invite.schema'
import { InviteStatus } from '@/lib/constants/enums'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const page = Number(searchParams.get('page') || '1')
    const limit = Number(searchParams.get('limit') || '20')
    const statusParam = searchParams.get('status')
    // Antes o filtro era IGNORADO: ?status=PENDING devolvia todos os convites
    const status = statusParam && statusParam in InviteStatus
      ? (statusParam as InviteStatus)
      : undefined

    const { data, total } = await inviteService.findAll({ page, limit, status })
    return paginatedResponse(data, { page, limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const body = await request.json()
    const validated = CreateInviteSchema.parse(body)

    const invite = await inviteService.create(validated, user.id)
    return successResponse(invite, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
