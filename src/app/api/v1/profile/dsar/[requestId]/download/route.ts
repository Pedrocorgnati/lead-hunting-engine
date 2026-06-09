import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { errorResponse, USER_080 } from '@/constants/errors'
import { prisma } from '@/lib/prisma'
import { profileService } from '@/services/profile.service'

interface RouteContext {
  params: Promise<{ requestId: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth()
    const { requestId } = await context.params

    const audit = await prisma.auditLog.findFirst({
      where: {
        id: requestId,
        userId: user.id,
        action: { in: ['profile.data_export_requested', 'profile.data_exported'] },
      },
      select: { id: true },
    })

    if (!audit) {
      return NextResponse.json(errorResponse(USER_080, 'Solicitacao DSAR nao encontrada.'), { status: 404 })
    }

    const exportData = await profileService.exportData(user.id, request.headers.get('x-forwarded-for') ?? undefined)
    const date = new Date().toISOString().slice(0, 10)

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="dsar-${requestId}-${date}.json"`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
