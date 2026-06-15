/**
 * outreach-engine (brainstorm 06-10, tasks 07/10): gestao da lista de
 * supressao. GET lista, POST adiciona, DELETE remove. Toda mutacao audita.
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse, paginatedResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { addSuppression, removeSuppression } from '@/lib/outreach/suppression'
import { AuditService } from '@/lib/services/audit-service'

const AddSchema = z.object({
  kind: z.enum(['EMAIL', 'DOMAIN']),
  value: z.string().min(3).max(320),
  reason: z.enum(['BOUNCED', 'UNSUBSCRIBED', 'REPLIED', 'COMPLAINT', 'MANUAL']),
  cooldownHours: z.number().int().positive().max(8760).optional(),
  notes: z.string().max(500).optional(),
})

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '50')))
    const [rows, total] = await Promise.all([
      prisma.suppressionEntry.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.suppressionEntry.count(),
    ])
    return paginatedResponse(rows, { page, limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const parsed = AddSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return handleApiError(parsed.error)
    const result = await addSuppression({ ...parsed.data, source: 'admin-manual', createdBy: admin.id })
    await AuditService.log({
      userId: admin.id,
      action: 'outreach.suppression_added',
      resource: 'suppression_entry',
      resourceId: result.id,
      metadata: { kind: parsed.data.kind, reason: parsed.data.reason },
    })
    return successResponse(result, 201)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const { searchParams } = new URL(request.url)
    const kind = searchParams.get('kind')
    const value = searchParams.get('value')
    if ((kind !== 'EMAIL' && kind !== 'DOMAIN') || !value) {
      return handleApiError(Object.assign(new Error('kind e value sao obrigatorios'), { code: 'VALIDATION', httpStatus: 400 }))
    }
    const removed = await removeSuppression(kind, value)
    await AuditService.log({
      userId: admin.id,
      action: 'outreach.suppression_removed',
      resource: 'suppression_entry',
      metadata: { kind, value, removed },
    })
    return successResponse({ removed })
  } catch (error) {
    return handleApiError(error)
  }
}
