import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-utils'
import { inviteService } from '@/services/invite.service'
import { ActivateAccountSchema } from '@/schemas/invite.schema'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const validated = ActivateAccountSchema.parse(body)

    const result = await inviteService.activate(token, validated)
    return NextResponse.json({ user: result }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
