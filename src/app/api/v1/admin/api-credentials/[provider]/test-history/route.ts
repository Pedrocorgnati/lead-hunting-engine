import { NextRequest } from 'next/server'
import { handleApiError } from '@/lib/api-utils'
import { getTestHistory } from '../../_credential-hardening'

/**
 * GET /api/v1/admin/api-credentials/[provider]/test-history
 * Historico de testes/rotacao/revogacao do provider, derivado da trilha de auditoria.
 * Aceita ?limit=N (1..200, default 50). RBAC: apenas ADMIN.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params
    return await getTestHistory(request, provider)
  } catch (error) {
    return handleApiError(error)
  }
}
