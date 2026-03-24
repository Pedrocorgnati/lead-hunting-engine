import { NextResponse } from 'next/server'
import { requireAuth, handleAuthError, AuthError } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AuditService } from '@/lib/services/audit-service'

export async function POST() {
  try {
    const user = await requireAuth()
    const supabase = await createClient()
    await supabase.auth.signOut()
    // RESOLVED: AuditService.log() após logout
    await AuditService.log({ userId: user.id, action: 'AUTH_LOGOUT', resource: 'auth' })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof AuthError) return handleAuthError(error)
    return NextResponse.json({ error: { code: 'SYS_001', message: 'Erro inesperado' } }, { status: 500 })
  }
}
