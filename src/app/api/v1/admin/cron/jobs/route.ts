import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { listCronJobs } from '@/lib/cron/registry'

/**
 * GET /api/v1/admin/cron/jobs
 *
 * Lista os cron jobs registrados (espelho de vercel.json > crons) com status
 * (ACTIVE/DISABLED via pause persistido), ultima execucao registrada e
 * proxima execucao calculada da expressao cron. RBAC: ADMIN.
 *
 * Consumido por AD29 /admin/jobs/cron.
 */
export async function GET() {
  try {
    await requireAdmin()
    const jobs = await listCronJobs()
    return successResponse({ jobs })
  } catch (error) {
    return handleApiError(error)
  }
}
