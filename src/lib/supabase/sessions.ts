/**
 * TASK-17 intake-review (CL-042, CL-468): wrapper para listar e revogar
 * sessoes individuais do usuario usando Supabase Admin API.
 *
 * Supabase nao tem um `listUserSessions` publico canonico no SDK; aqui
 * consultamos `auth.sessions` via SQL service-role (read-only) e
 * revogamos via REST admin API quando necessario.
 *
 * Retorno e normalizado para o formato que a UI consome.
 */
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from './admin'

export interface UserSession {
  id: string
  createdAt: string
  lastActiveAt: string | null
  userAgent: string | null
  ip: string | null
}

/**
 * Lista sessoes ativas do usuario.
 * A tabela `auth.sessions` nao e exposta via SDK, entao usamos raw SQL
 * com service-role (acessando o schema `auth`).
 */
export async function listUserSessions(userId: string): Promise<UserSession[]> {
  type Row = {
    id: string
    created_at: Date
    updated_at: Date | null
    user_agent: string | null
    ip: string | null
  }
  try {
    // Parenteses OBRIGATORIOS em (not_after IS NULL OR not_after > NOW()) —
    // sem eles AND tem precedencia maior que OR e a query vaza sessoes
    // de outros usuarios. Ver adversarial review sess-20260424-p2p3-wave-review.
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT id::text, created_at, updated_at, user_agent, ip
       FROM auth.sessions
       WHERE user_id = $1::uuid
         AND (not_after IS NULL OR not_after > NOW())
       ORDER BY updated_at DESC NULLS LAST, created_at DESC
       LIMIT 50`,
      userId,
    )
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at.toISOString(),
      lastActiveAt: r.updated_at ? r.updated_at.toISOString() : null,
      userAgent: r.user_agent,
      ip: r.ip,
    }))
  } catch (err) {
    // RLS/permission falha deve ser observavel, nao silenciada.
    // Log estruturado permite distinguir "sem sessoes" de "feature quebrada".
    // eslint-disable-next-line no-console
    console.warn('[supabase/sessions] listUserSessions failed — returning empty list.', {
      userId,
      reason: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Revoga UMA sessao especifica. Invoca Supabase Admin REST
 * (SDK `admin.signOut` sem sessionId -> global; aqui chamamos a API
 * `POST /auth/v1/admin/users/{userId}/logout?scope=others` nao atende
 * "apenas essa sessao", entao usamos endpoint REST direto).
 */
export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const admin = getSupabaseAdmin()
  const { data: user, error } = await admin.auth.admin.getUserById(userId)
  if (error || !user?.user) throw new Error(`user not found: ${userId}`)
  // Como nao ha SDK canonico para revogar sessao individual, usamos DELETE
  // direto em `auth.sessions` via service-role — seguro porque chamada
  // roda server-side com supabase service role.
  await prisma.$executeRawUnsafe(
    `DELETE FROM auth.sessions WHERE id = $1::uuid AND user_id = $2::uuid`,
    sessionId,
    userId,
  )
}

/** Melhor-esforço para identificar a sessao atual do usuario (por user_agent + ip). */
export async function markCurrentSession(
  sessions: UserSession[],
  currentUserAgent: string | null,
  currentIp: string | null,
): Promise<UserSession & { isCurrent?: boolean }[]> {
  return sessions.map((s) => ({
    ...s,
    isCurrent: Boolean(
      currentUserAgent && currentIp && s.userAgent === currentUserAgent && s.ip === currentIp,
    ),
  })) as UserSession[] & { isCurrent?: boolean }[]
}
