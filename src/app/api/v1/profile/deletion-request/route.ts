import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { profileService } from '@/services/profile.service'

export async function POST() {
  try {
    const user = await requireAuth()
    await profileService.requestDeletion(user.id)
    return NextResponse.json({ message: 'Solicitação de exclusão registrada. Processamento em até 15 dias.' })
  } catch (error) {
    return handleApiError(error)
  }
}
