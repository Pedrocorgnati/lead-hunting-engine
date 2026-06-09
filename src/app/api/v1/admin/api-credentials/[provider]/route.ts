import { NextRequest } from 'next/server'
import { handleApiError } from '@/lib/api-utils'
import { revokeCredential } from '../_credential-hardening'

/**
 * DELETE /api/v1/admin/api-credentials/[provider]
 * Revoga (remove) a credencial do provider. Exige reauth + motivo; audita.
 * RBAC: apenas ADMIN.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params
    return await revokeCredential(request, provider)
  } catch (error) {
    return handleApiError(error)
  }
}
