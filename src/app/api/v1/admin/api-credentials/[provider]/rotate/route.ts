import { NextRequest } from 'next/server'
import { handleApiError } from '@/lib/api-utils'
import { rotateCredential } from '../../_credential-hardening'

/**
 * POST /api/v1/admin/api-credentials/[provider]/rotate
 * Rotaciona a chave do provider (re-encripta + testa). Exige reauth + motivo; audita.
 * RBAC: apenas ADMIN.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params
    return await rotateCredential(request, provider)
  } catch (error) {
    return handleApiError(error)
  }
}
