import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { profileService } from '@/services/profile.service'
import { UpdateProfileSchema } from '@/schemas/profile.schema'
import { errorResponse, USER_080 } from '@/constants/errors'

export async function GET() {
  try {
    const user = await requireAuth()
    const profile = await profileService.findById(user.id)

    if (!profile) {
      return NextResponse.json(errorResponse(USER_080), { status: 404 })
    }

    return successResponse(profile)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const validated = UpdateProfileSchema.parse(body)

    const profile = await profileService.update(user.id, validated)
    return successResponse(profile)
  } catch (error) {
    return handleApiError(error)
  }
}
