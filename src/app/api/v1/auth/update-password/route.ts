import { NextRequest, NextResponse } from 'next/server'
import { UpdatePasswordSchema } from '@/schemas/auth.schema'
import { requireAuth } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    await requireAuth()
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

    return NextResponse.json({ message: 'Senha atualizada com sucesso.' })
  } catch (error) {
    return handleApiError(error)
  }
}
