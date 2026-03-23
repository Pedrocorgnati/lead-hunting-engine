import { NextResponse } from 'next/server'
import { requireAuth, handleAuthError, AuthError } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    await requireAuth()
    const supabase = await createClient()
    await supabase.auth.signOut()
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof AuthError) return handleAuthError(error)
    return NextResponse.json({ error: { code: 'SYS_001', message: 'Erro inesperado' } }, { status: 500 })
  }
}
