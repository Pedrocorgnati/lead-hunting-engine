import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { configService } from '@/services/config.service'

/**
 * POST /api/v1/admin/config/credentials/[provider]/test
 * Testa se a credencial do provider é válida chamando o endpoint externo.
 * Erros de conexão são tratados como resultado de teste ({ ok: false }) — não 500.
 * RBAC: apenas ADMIN.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    await requireAdmin()
    const { provider } = await params
    const result = await configService.testCredential(provider.toUpperCase())
    return successResponse(result)
  } catch (error) {
    return handleApiError(error)
  }
}
