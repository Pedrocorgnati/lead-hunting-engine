import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { configService } from '@/services/config.service'

/**
 * DELETE /api/v1/api-credentials/[id]
 *
 * Remove uma credencial global por id. Apenas admins (ApiCredential é um
 * recurso global neste projeto — sem `userId` no modelo Prisma).
 *
 * Safeguard (CL-206): bloqueia com 409 quando há CollectionJob ativo
 * (PENDING/RUNNING) consumindo o provider correspondente.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      undefined
    await configService.deleteCredential({ id }, admin.id, ipAddress)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
