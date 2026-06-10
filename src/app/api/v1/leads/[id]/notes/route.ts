import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { leadService } from '@/services/lead.service'
import { UpdateLeadNotesSchema } from '@/schemas/lead.schema'
import { errorResponse, LEAD_080 } from '@/constants/errors'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/v1/leads/:id/notes — anotacoes atuais do lead (item 034: a aba de
 * notas consome este endpoint no mount em vez de depender so de props).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lead = await prisma.lead.findFirst({
      where: { id, userId: user.id },
      select: { notes: true, updatedAt: true },
    })
    if (!lead) {
      return NextResponse.json(errorResponse(LEAD_080), { status: 404 })
    }
    return successResponse({ notes: lead.notes ?? '', updatedAt: lead.updatedAt.toISOString() })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await request.json()
    const validated = UpdateLeadNotesSchema.parse(body)

    const lead = await leadService.updateNotes(id, user.id, validated)
    return successResponse(lead)
  } catch (error) {
    return handleApiError(error)
  }
}
