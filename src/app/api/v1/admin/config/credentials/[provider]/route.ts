import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { configService } from '@/services/config.service'
import { UpsertCredentialSchema } from '@/schemas/config.schema'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    await requireAdmin()
    const { provider } = await params
    const body = await request.json()
    const validated = UpsertCredentialSchema.parse(body)

    const credential = await configService.upsertCredential(provider, validated)
    return successResponse(credential)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const admin = await requireAdmin()
    const { provider } = await params
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      undefined
    await configService.deleteCredential({ provider }, admin.id, ipAddress)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
