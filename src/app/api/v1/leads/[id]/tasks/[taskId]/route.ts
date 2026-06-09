/**
 * TASK-54 C4: lembretes por lead.
 * PATCH  /api/v1/leads/:id/tasks/:taskId -> atualiza status/conteudo
 * DELETE /api/v1/leads/:id/tasks/:taskId -> remove
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { errorResponse, LEAD_080 } from '@/constants/errors'
import { getLeadTasksFromMetadata, MAX_TASK_TITLE_CHARS, writeLeadTasksToMetadata } from '@/lib/leads/lead-tasks'

const PatchTaskSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TASK_TITLE_CHARS).optional(),
  dueAt: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined
      if (value === null || value.length === 0) return null
      return value
    }),
  completed: z.boolean().optional(),
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

function parseTaskInputDueAt(value: string | null | undefined) {
  if (value === undefined || value === null) return value
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    const err = Object.assign(new Error('Formato de vencimento inválido.'), { code: 'VAL_002', httpStatus: 400 })
    throw err
  }
  return parsed.toISOString()
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const user = await requireAuth()
    const { id, taskId } = await params
    const lead = await ensureLeadOwnership(id, user.id, user.role)
    if (!lead) return NextResponse.json(errorResponse(LEAD_080), { status: LEAD_080.httpStatus })

    const body = PatchTaskSchema.parse(await request.json())

    if (body.title === undefined && body.completed === undefined && body.dueAt === undefined) {
      const err = Object.assign(new Error('Nenhum campo foi informado para atualização.'), {
        code: 'VAL_001',
        httpStatus: 400,
      })
      throw err
    }

    const tasks = getLeadTasksFromMetadata(lead.metadata as never)
    const now = new Date().toISOString()
    const index = tasks.findIndex((task) => task.id === taskId)
    if (index < 0) {
      const err = Object.assign(new Error('Reminder não encontrado.'), { code: 'VAL_001', httpStatus: 404 })
      throw err
    }

    const dueAt = parseTaskInputDueAt(body.dueAt)
    const current = tasks[index]
    const updated = {
      ...current,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.completed !== undefined ? { completed: body.completed } : {}),
      ...(body.dueAt !== undefined ? { dueAt } : {}),
      updatedAt: now,
    }

    const next = [...tasks]
    next[index] = updated

    const metadata = {
      ...(typeof lead.metadata === 'object' && lead.metadata !== null ? lead.metadata : {}),
      ...writeLeadTasksToMetadata(next),
    }

    await prisma.lead.update({
      where: { id },
      data: { metadata },
    })

    return successResponse({ task: updated })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const user = await requireAuth()
    const { id, taskId } = await params
    const lead = await ensureLeadOwnership(id, user.id, user.role)
    if (!lead) return NextResponse.json(errorResponse(LEAD_080), { status: LEAD_080.httpStatus })

    const tasks = getLeadTasksFromMetadata(lead.metadata as never)
    const next = tasks.filter((task) => task.id !== taskId)
    if (next.length === tasks.length) {
      const err = Object.assign(new Error('Reminder não encontrado.'), { code: 'VAL_001', httpStatus: 404 })
      throw err
    }

    const metadata = {
      ...(typeof lead.metadata === 'object' && lead.metadata !== null ? lead.metadata : {}),
      ...writeLeadTasksToMetadata(next),
    }

    await prisma.lead.update({
      where: { id },
      data: { metadata },
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
