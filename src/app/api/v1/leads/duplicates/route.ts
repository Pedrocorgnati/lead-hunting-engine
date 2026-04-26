import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import type { DuplicateStatus } from '@prisma/client'

const VALID_STATUS = new Set<DuplicateStatus>([
  'PENDING',
  'MERGED',
  'KEEP_BOTH',
  'REJECTED',
  'UNDONE',
])

/**
 * GET /api/v1/leads/duplicates
 *
 * Query:
 *   status (default PENDING), page (1), limit (<=50)
 *
 * Retorna candidatos com leads primary e candidate hidratados,
 * escopados pelo userId (RLS a nivel de aplicacao).
 *
 * Origem: TASK-9 intake-review / CL-224.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const statusParam = (searchParams.get('status') ?? 'PENDING').toUpperCase()
    const status: DuplicateStatus = VALID_STATUS.has(statusParam as DuplicateStatus)
      ? (statusParam as DuplicateStatus)
      : 'PENDING'
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10))
    )

    const where = { userId: user.id, status }

    const [rows, total] = await Promise.all([
      prisma.duplicateCandidate.findMany({
        where,
        orderBy: [{ similarity: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.duplicateCandidate.count({ where }),
    ])

    const leadIds = new Set<string>()
    for (const row of rows) {
      leadIds.add(row.primaryLeadId)
      leadIds.add(row.candidateLeadId)
    }

    const leads = await prisma.lead.findMany({
      where: { id: { in: Array.from(leadIds) } },
      select: {
        id: true,
        businessName: true,
        category: true,
        city: true,
        state: true,
        phone: true,
        website: true,
        email: true,
        score: true,
      },
    })
    const leadById = new Map(leads.map((l) => [l.id, l]))

    const data = rows.map((row) => ({
      id: row.id,
      similarity: row.similarity,
      reasons: row.reasons,
      status: row.status,
      mergedAt: row.mergedAt,
      undoneAt: row.undoneAt,
      primary: leadById.get(row.primaryLeadId) ?? null,
      candidate: leadById.get(row.candidateLeadId) ?? null,
    }))

    return paginatedResponse(data, { page, limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}
