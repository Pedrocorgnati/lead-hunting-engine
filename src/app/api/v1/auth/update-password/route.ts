import { NextRequest, NextResponse } from 'next/server'
import { UpdatePasswordSchema } from '@/schemas/auth.schema'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter'
import { AuditService } from '@/lib/services/audit-service'
import { prisma } from '@/lib/prisma'

// TASK-0/ST002: Rate limit — 3 requests/min por IP (update-password)
const RATE_LIMIT = 3

export async function POST(request: NextRequest) {
  try {
    // Rate limiting (TASK-0/ST002)
    const ip = getClientIp(request)
    const rl = checkRateLimit(`auth-update-password:${ip}`, RATE_LIMIT)
    if (!rl.success) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT', message: 'Muitas tentativas. Aguarde antes de tentar novamente.' } },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfter) },
        }
      )
    }

    const user = await requireAuth()
    const body = await request.json()
    const validated = UpdatePasswordSchema.parse(body)

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({
      password: validated.password,
    })

    if (error) {
      return NextResponse.json(
        { error: { code: 'AUTH_005', message: error.message } },
        { status: 400 }
      )
    }

    // TASK-4/ST001 (CL-467): invalida TODAS as sessoes ativas do usuario
    // apos troca de senha bem-sucedida. Supabase global signOut revoga
    // refresh tokens; access tokens existentes expiram em minutos.
    try {
      const admin = createAdminClient()
      await admin.auth.admin.signOut(user.id, 'global')
    } catch (signOutErr) {
      // Nao bloqueia o fluxo: senha ja foi trocada. Loga para auditoria.
      if (process.env.NODE_ENV !== 'production') {
        console.error('[update-password] signOut global falhou:', signOutErr)
      }
    }

    await AuditService.log({
      userId: user.id,
      action: 'session.invalidated_by_password_change',
      resource: 'auth_session',
      resourceId: user.id,
      metadata: { reason: 'password_changed' },
      ipAddress: ip,
    })

    // TASK-7/ST002 (CL-473): reset da flag must_reset_password.
    // Se estava ativa, registra conclusao do fluxo forcado.
    const profile = await prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { mustResetPassword: true },
    })
    if (profile?.mustResetPassword) {
      await prisma.userProfile.update({
        where: { id: user.id },
        data: { mustResetPassword: false },
      })
      await AuditService.log({
        userId: user.id,
        action: 'forced_password_reset_completed',
        resource: 'user_profile',
        resourceId: user.id,
        metadata: { trigger: 'update_password' },
        ipAddress: ip,
      })
    }

    return NextResponse.json({
      data: {
        message: 'Senha atualizada com sucesso.',
        forceRelogin: true,
        reason: 'password_changed',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
