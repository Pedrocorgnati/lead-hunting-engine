/**
 * Task A15 — Hardening operacional de credenciais (P0).
 *
 * Endpoints de operacao sensivel sobre o cofre de ApiCredential, reaproveitando o
 * cofre base (`configService` + `AuditService`) sem duplicar a listagem/mascara:
 *
 *   POST   /api/v1/admin/api-credentials/:provider/rotate        -> rotaciona a chave
 *   DELETE /api/v1/admin/api-credentials/:provider               -> revoga a credencial
 *   GET    /api/v1/admin/api-credentials/:provider/test-history  -> historico de testes
 *
 * Toda mutacao exige reautenticacao (validateReauthSession, mesmo mecanismo dos
 * provider-operations) e registra motivo, operador, correlationId e resultado de
 * teste na trilha de auditoria (AuditLog), de onde o test-history e derivado.
 *
 * RBAC: apenas ADMIN (requireAdmin).
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { configService } from '@/services/config.service'
import { AuditService } from '@/lib/services/audit-service'
import { validateReauthSession } from '@/lib/security/reauth-challenge-store'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROVIDER_SLUG_MAP: Record<string, string> = {
  'google-maps': 'GOOGLE_MAPS',
  'google-places': 'GOOGLE_PLACES',
  'here-maps': 'HERE_MAPS',
  'linkedin-company': 'LINKEDIN_COMPANY',
}

/** Normaliza o param de rota para a chave canonica (uppercase) usada no DB. */
function normalizeProvider(input: string): string {
  const normalized = input.trim().toLowerCase()
  return PROVIDER_SLUG_MAP[normalized] ?? normalized.toUpperCase().replace(/-/g, '_')
}

function getIp(request: NextRequest): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    undefined
  )
}

function buildError(code: string, message: string, httpStatus: number, details?: unknown) {
  return Object.assign(new Error(message), { code, httpStatus, details })
}

function requireReauth(reauthId: string | undefined, userId: string, scope: string) {
  if (!reauthId) {
    throw buildError(
      'AUTH_REAUTH_REQUIRED',
      'Reautenticacao obrigatoria: informe reauthId (body ou header x-reauth-id).',
      401,
      { scope }
    )
  }
  const reauth = validateReauthSession({ reauthId, userId, scope })
  if (!reauth.ok) {
    throw buildError('AUTH_REAUTH_REQUIRED', 'Reautenticacao invalida ou expirada.', 401, {
      reason: reauth.reason,
      scope,
    })
  }
}

const RotateSchema = z.object({
  apiKey: z.string().min(1, 'Nova chave de API e obrigatoria.'),
  reauthId: z.string().trim().min(1).max(160),
  correlationId: z.string().trim().min(1).max(160).optional(),
  reason: z.string().trim().max(500).optional(),
})

// ─── POST /:provider/rotate ───────────────────────────────────────────────────

export async function rotateCredential(request: NextRequest, providerParam: string) {
  const admin = await requireAdmin()
  const provider = normalizeProvider(providerParam)
  const body = RotateSchema.parse(await request.json().catch(() => ({})))
  const correlationId = body.correlationId ?? crypto.randomUUID()
  const scope = `admin.api-credentials:${provider}:rotate`

  requireReauth(body.reauthId, admin.id, scope)

  const existing = await prisma.apiCredential.findUnique({ where: { provider } })
  if (!existing) {
    throw buildError('CONFIG_080', 'Credencial de API nao encontrada.', 404, { provider })
  }

  const ip = getIp(request)

  // Reaproveita o cofre base: re-encripta + persiste (audita credential.updated).
  const credential = await configService.upsertCredential(provider, { apiKey: body.apiKey }, admin.id, ip)

  // Testa imediatamente a nova chave e grava o resultado na trilha (alimenta test-history).
  const test = await configService.testCredential(provider)
  await AuditService.log({
    userId: admin.id,
    action: 'credential.tested',
    resource: 'api_credentials',
    resourceId: existing.id,
    metadata: { provider, ok: test.ok, message: test.message, correlationId, origin: 'rotate' },
    ipAddress: ip,
  })

  await AuditService.log({
    userId: admin.id,
    action: 'credential.rotated',
    resource: 'api_credentials',
    resourceId: existing.id,
    metadata: {
      provider,
      correlationId,
      reason: body.reason ?? null,
      testOk: test.ok,
      rotatedFromUpdatedAt: existing.updatedAt.toISOString(),
    },
    ipAddress: ip,
  })

  return successResponse({ credential, test, correlationId })
}

// ─── DELETE /:provider (revoke) ───────────────────────────────────────────────

export async function revokeCredential(request: NextRequest, providerParam: string) {
  const admin = await requireAdmin()
  const provider = normalizeProvider(providerParam)
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const reauthId =
    (typeof raw.reauthId === 'string' && raw.reauthId.trim()) ||
    request.headers.get('x-reauth-id')?.trim() ||
    undefined
  const reason =
    (typeof raw.reason === 'string' ? raw.reason.trim() : undefined) ||
    request.headers.get('x-revoke-reason')?.trim() ||
    undefined
  const correlationId =
    (typeof raw.correlationId === 'string' && raw.correlationId.trim()) ||
    request.headers.get('x-correlation-id')?.trim() ||
    crypto.randomUUID()

  const scope = `admin.api-credentials:${provider}:revoke`
  requireReauth(reauthId, admin.id, scope)

  const existing = await prisma.apiCredential.findUnique({ where: { provider } })
  if (!existing) {
    throw buildError('CONFIG_080', 'Credencial de API nao encontrada.', 404, { provider })
  }

  const ip = getIp(request)

  // Registra motivo/operador/correlationId ANTES do delete (resourceId ainda valido).
  await AuditService.log({
    userId: admin.id,
    action: 'credential.revoked',
    resource: 'api_credentials',
    resourceId: existing.id,
    metadata: { provider, correlationId, reason: reason ?? null },
    ipAddress: ip,
  })

  // Reaproveita o cofre base: guard de jobs ativos + delete + audit credential.deleted.
  await configService.deleteCredential({ provider }, admin.id, ip)

  return successResponse({ provider, revoked: true, correlationId })
}

// ─── GET /:provider/test-history ──────────────────────────────────────────────

export async function getTestHistory(request: NextRequest, providerParam: string) {
  await requireAdmin()
  const provider = normalizeProvider(providerParam)

  const existing = await prisma.apiCredential.findUnique({
    where: { provider },
    select: { id: true },
  })
  if (!existing) {
    throw buildError('CONFIG_080', 'Credencial de API nao encontrada.', 404, { provider })
  }

  const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? '50')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50

  const rows = await prisma.auditLog.findMany({
    where: {
      resourceId: existing.id,
      action: { in: ['credential.tested', 'credential.rotated', 'credential.revoked'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, action: true, userId: true, metadata: true, ipAddress: true, createdAt: true },
  })

  const history = rows.map((row) => {
    const md = (row.metadata ?? {}) as Record<string, unknown>
    return {
      id: row.id,
      action: row.action,
      ok: typeof md.ok === 'boolean' ? md.ok : null,
      message: typeof md.message === 'string' ? md.message : null,
      reason: typeof md.reason === 'string' ? md.reason : null,
      correlationId: typeof md.correlationId === 'string' ? md.correlationId : null,
      origin: typeof md.origin === 'string' ? md.origin : null,
      operatorId: row.userId,
      ipAddress: row.ipAddress,
      at: row.createdAt,
    }
  })

  // Zero Estados Indefinidos: lista vazia retorna { total: 0, history: [] }.
  return successResponse({ provider, total: history.length, history })
}
