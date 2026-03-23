import { NextRequest, NextResponse } from 'next/server'
import { ResetPasswordSchema } from '@/schemas/auth.schema'
import { handleApiError } from '@/lib/api-utils'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = ResetPasswordSchema.parse(body)

    const supabase = await createClient()
    await supabase.auth.resetPasswordForEmail(validated.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
    })

    // Generic message to prevent user enumeration
    return NextResponse.json({ message: 'Se o email existir, você receberá um link de redefinição.' })
  } catch (error) {
    return handleApiError(error)
  }
}
