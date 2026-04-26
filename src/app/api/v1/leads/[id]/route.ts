import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { leadService } from '@/services/lead.service'
import { errorResponse, LEAD_080 } from '@/constants/errors'
import { prisma } from '@/lib/prisma'
import { LeadPatchSchema } from '@/lib/schemas/lead'
import { trackLeadChanges } from '@/lib/intelligence/enrichment/enrichers/history-tracker'
import type { Lead } from '@prisma/client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lead = await leadService.findById(id, user.id)

    if (!lead) {
      return NextResponse.json(errorResponse(LEAD_080), { status: 404 })
    }

    return successResponse(lead)
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

    const raw = await request.json()
    const data = LeadPatchSchema.parse(raw)

    // RLS: admin pode editar qualquer lead; demais só os próprios
    const whereOwnership =
      user.role === 'ADMIN' ? { id } : { id, userId: user.id }

    const existing = await prisma.lead.findFirst({
      where: whereOwnership,
    })
    if (!existing) {
      return NextResponse.json(errorResponse(LEAD_080), { status: 404 })
    }

    const RETENTION_DAYS = 15
    const now = new Date()
    const updateData: Record<string, unknown> = { ...data }

    if (data.status) {
      if (data.status === 'CONTACTED') updateData.contactedAt = now
      if (data.status === 'DISCARDED') {
        updateData.retentionUntil = new Date(
          now.getTime() + RETENTION_DAYS * 86_400_000
        )
      } else if (data.status !== 'FALSE_POSITIVE') {
        updateData.retentionUntil = null
      }
    }

    const updated = (await prisma.lead.update({
      where: { id },
      data: updateData as never,
    })) as Lead

    // TASK-5: registrar mudancas em lead_history (best-effort, nao quebra response)
    await trackLeadChanges(
      id,
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    )

    return successResponse(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
