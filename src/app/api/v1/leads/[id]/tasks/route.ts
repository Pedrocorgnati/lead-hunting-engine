/**
 * TASK-54 C4: lembretes por lead.
 * GET  /api/v1/leads/:id/tasks    -> lista
 * POST /api/v1/leads/:id/tasks    -> cria
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { errorResponse, LEAD_080 } from '@/constants/errors'
import { getLeadTasksFromMetadata, MAX_TASK_TITLE_CHARS, writeLeadTasksToMetadata } from '@/lib/leads/lead-tasks'

const CreateTaskSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TASK_TITLE_CHARS),
  dueAt: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined))
    .refine((value) => value === undefined || !Number.isNaN(new Date(value).getTime()), {
      message: 'Data de vencimento inválida',
    }),
})

const ensureLeadOwnership = async (leadId: string, userId: string, role: string) => {
  const where = role === 'ADMIN' ? { id: leadId } : { id: leadId, userId }
  return prisma.lead.findFirst({
    where,
    select: {
      id: true,
      metadata: true,
    },
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lead = await ensureLeadOwnership(id, user.id, user.role)
    if (!lead) return NextResponse.json(errorResponse(LEAD_080), { status: LEAD_080.httpStatus })

    const tasks = getLeadTasksFromMetadata(lead.metadata as never)
    return successResponse({ tasks })
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
    const lead = await ensureLeadOwnership(id, user.id, user.role)
    if (!lead) return NextResponse.json(errorResponse(LEAD_080), { status: LEAD_080.httpStatus })

    const body = CreateTaskSchema.parse(await request.json())

    const now = new Date().toISOString()
    const current = getLeadTasksFromMetadata(lead.metadata as never)
    const next = [
      ...current,
      {
        id: crypto.randomUUID(),
        title: body.title,
        dueAt: body.dueAt ? new Date(body.dueAt).toISOString() : null,
        completed: false,
        createdAt: now,
        updatedAt: now,
      },
    ]

    const nextTask = next[next.length - 1]

    const metadata = {
      ...(typeof lead.metadata === 'object' && lead.metadata !== null ? lead.metadata : {}),
      ...writeLeadTasksToMetadata(next),
    }

    await prisma.lead.update({
      where: { id },
      data: { metadata },
    })

    return successResponse({ task: nextTask }, 201)
  } catch (error) {
    return handleApiError(error)
  }
}
