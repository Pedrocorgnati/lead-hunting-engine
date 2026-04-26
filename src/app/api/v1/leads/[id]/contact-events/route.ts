/**
 * TASK-18/ST005 (CL-283): endpoints de contact events estruturados.
 * GET  /api/v1/leads/[id]/contact-events -> lista ordenada desc
 * POST /api/v1/leads/[id]/contact-events  {channel, outcome, note?} -> cria
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { errorResponse, LEAD_080 } from '@/constants/errors'

const CreateBody = z.object({
  channel: z.enum(['WHATSAPP', 'EMAIL', 'TELEFONE', 'PRESENCIAL', 'OUTRO']),
  outcome: z.enum(['NO_ANSWER', 'ANSWERED', 'INTERESTED', 'REJECTED', 'SCHEDULED']),
  note: z.string().max(2000).optional(),
})

async function ensureLead(leadId: string, userId: string, role: string) {
  const whereOwnership = role === 'ADMIN' ? { id: leadId } : { id: leadId, userId }
  return prisma.lead.findFirst({ where: whereOwnership, select: { id: true } })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lead = await ensureLead(id, user.id, user.role)
    if (!lead) return NextResponse.json(errorResponse(LEAD_080), { status: 404 })

    const events = await prisma.contactEvent.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return successResponse({ events })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lead = await ensureLead(id, user.id, user.role)
    if (!lead) return NextResponse.json(errorResponse(LEAD_080), { status: 404 })

    const body = CreateBody.parse(await request.json())
    const event = await prisma.contactEvent.create({
      data: {
        leadId: id,
        userId: user.id,
        channel: body.channel,
        outcome: body.outcome,
        note: body.note,
      },
    })
    return successResponse({ event }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
