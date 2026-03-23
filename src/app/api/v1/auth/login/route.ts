import { NextRequest, NextResponse } from 'next/server'
import { SignInSchema } from '@/schemas/auth.schema'
import { handleApiError } from '@/lib/api-utils'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { errorResponse, AUTH_002 } from '@/constants/errors'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = SignInSchema.parse(body)

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validated.email,
      password: validated.password,
    })

    if (error) {
      return NextResponse.json(errorResponse(AUTH_002), { status: 401 })
    }

    const profile = await prisma.userProfile.findUnique({
      where: { id: data.user.id },
    })

    return NextResponse.json({ user: profile })
  } catch (error) {
    return handleApiError(error)
  }
}
