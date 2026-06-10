import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'

/**
 * GET /api/v1/admin/users/[id]/sessions
 *
 * Sessoes ativas do usuario (item 039 / AD3). Fonte: auth.sessions do GoTrue
 * (mesmo Postgres), via raw SQL — o supabase-js admin nao expoe listagem de
 * sessoes. Apenas metadados (created/refreshed/UA/IP); nenhum token e exposto.
 * RBAC: ADMIN.
 */
interface SessionRow {
  id: string
  created_at: Date
  updated_at: Date | null
  refreshed_at: Date | null
  user_agent: string | null
  ip: string | null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id: targetId } = await params

    const target = await prisma.userProfile.findUnique({ where: { id: targetId }, select: { id: true } })
    if (!target) {
      return NextResponse.json(
        { error: { code: 'USER_404', message: 'Usuario nao encontrado.' } },
        { status: 404 },
      )
    }

    const rows = await prisma.$queryRaw<SessionRow[]>`
      SELECT id, created_at, updated_at, refreshed_at, user_agent, ip::text AS ip
      FROM auth.sessions
      WHERE user_id = ${targetId}::uuid
        AND (not_after IS NULL OR not_after > NOW())
      ORDER BY COALESCE(refreshed_at, updated_at, created_at) DESC
      LIMIT 50
    `

    return successResponse({
      sessions: rows.map((s) => ({
        id: s.id,
        createdAt: s.created_at.toISOString(),
        lastSeenAt: (s.refreshed_at ?? s.updated_at ?? s.created_at).toISOString(),
        userAgent: s.user_agent,
        ip: s.ip,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
