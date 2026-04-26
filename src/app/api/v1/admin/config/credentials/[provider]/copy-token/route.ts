/**
 * TASK-23 intake-review (CL-079):
 * Admin copia valor de credencial sem expor no DOM/logs.
 *
 * Fluxo:
 *   POST /api/v1/admin/config/credentials/[provider]/copy-token
 *     → emite token opaco com TTL 30s; retorna { token }
 *   GET  /api/v1/admin/config/credentials/[provider]/copy-token?t=<token>
 *     → consome o token (1x), retorna { value } + registra AuditLog
 *
 * Token reusado retorna 410 Gone.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { CryptoUtil, unpackEncrypted } from '@/lib/services/crypto-util'
import { AuditService } from '@/lib/services/audit-service'
import { issueCopyToken, consumeCopyToken, CopyTokenQuotaExceededError } from '@/lib/security/copy-token-store'

function getIp(request: NextRequest): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined
  )
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { provider } = await params

    const credential = await prisma.apiCredential.findUnique({ where: { provider } })
    if (!credential) {
      return NextResponse.json(
        { error: { code: 'CONFIG_080', message: 'Credencial não encontrada.' } },
        { status: 404 },
      )
    }

    let token: string
    try {
      token = issueCopyToken(provider, admin.id)
    } catch (err) {
      if (err instanceof CopyTokenQuotaExceededError) {
        return NextResponse.json(
          {
            error: {
              code: 'RATE_001',
              message: 'Voce excedeu o limite de tokens simultaneos. Aguarde alguns segundos.',
            },
          },
          { status: 429 },
        )
      }
      throw err
    }
    return successResponse({ token, ttlSeconds: 30 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const admin = await requireAdmin()
    const { provider } = await params
    const token = request.nextUrl.searchParams.get('t')

    if (!token) {
      return NextResponse.json(
        { error: { code: 'VAL_001', message: 'Parametro `t` é obrigatório.' } },
        { status: 400 },
      )
    }

    const entry = consumeCopyToken(token)
    if (!entry) {
      return NextResponse.json(
        { error: { code: 'AUTH_005', message: 'Token inválido, expirado ou já utilizado.' } },
        { status: 410 },
      )
    }
    if (entry.provider !== provider || entry.actorId !== admin.id) {
      return NextResponse.json(
        { error: { code: 'AUTH_004', message: 'Token não corresponde a esta credencial.' } },
        { status: 403 },
      )
    }

    const credential = await prisma.apiCredential.findUnique({ where: { provider } })
    if (!credential) {
      return NextResponse.json(
        { error: { code: 'CONFIG_080', message: 'Credencial não encontrada.' } },
        { status: 404 },
      )
    }

    let value: string
    try {
      const { encryptedKey, authTag } = unpackEncrypted(credential.encryptedKey)
      value = CryptoUtil.decrypt(encryptedKey, credential.iv, authTag)
    } catch {
      return NextResponse.json(
        { error: { code: 'CONFIG_050', message: 'Falha ao descriptografar a credencial.' } },
        { status: 500 },
      )
    }

    await AuditService.log({
      userId: admin.id,
      action: 'ADMIN_CREDENTIAL_COPIED',
      resource: 'api_credential',
      resourceId: credential.id,
      metadata: { provider },
      ipAddress: getIp(request),
    })

    // Resposta com cache-control para evitar proxies/logs reterem o value.
    const res = successResponse({ value })
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    res.headers.set('Pragma', 'no-cache')
    return res
  } catch (error) {
    return handleApiError(error)
  }
}
