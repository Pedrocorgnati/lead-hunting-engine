import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-utils'
import { createClient } from '@/lib/supabase/server'

const ResetSchema = z.object({
  password: z.string().min(8, 'Minimo 8 caracteres').max(128),
  token: z.string().trim().min(1).max(600),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password, token } = ResetSchema.parse(body)

    const supabase = await createClient()

    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: 'recovery',
    })

    if (otpError) {
      return NextResponse.json(
        { error: { code: 'TOKEN_INVALID', message: 'Token invalido, expirado ou ja utilizado.' } },
        { status: 422 },
      )
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      return NextResponse.json(
        { error: { code: 'UPDATE_FAILED', message: updateError.message } },
        { status: 422 },
      )
    }

    await supabase.auth.signOut()

    return NextResponse.json({
      data: { message: 'Senha redefinida com sucesso. Faca login com sua nova senha.' },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
