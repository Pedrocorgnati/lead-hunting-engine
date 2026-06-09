import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { NOTIFICATION_EVENTS, EVENT_LABELS } from '@/lib/notifications/copy'

export async function GET() {
  try {
    await requireAuth()
    const events = NOTIFICATION_EVENTS.map((key) => ({ key, label: EVENT_LABELS[key] }))
    return successResponse({ events })
  } catch (error) {
    return handleApiError(error)
  }
}
