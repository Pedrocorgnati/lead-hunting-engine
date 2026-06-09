import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { configService } from '@/services/config.service'

/**
 * GET /api/v1/admin/api-credentials
 *
 * Listagem resumida das credenciais (reaproveita o cofre base — `getCredentials`
 * mascara o valor; plaintext nunca exposto). Os endpoints de hardening
 * (rotate/revoke/test-history) vivem em `[provider]/*`.
 *
 * RBAC: apenas ADMIN.
 */
export async function GET() {
  try {
    await requireAdmin()
    const credentials = await configService.getCredentials()
    return successResponse({ credentials })
  } catch (error) {
    return handleApiError(error)
  }
}
