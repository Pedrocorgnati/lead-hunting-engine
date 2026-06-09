import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-utils'

// Supabase recovery OTPs are single-use: calling verifyOtp here would consume the token
// and break the subsequent POST /reset. This endpoint does a format-only plausibility check;
// the POST is the authoritative validator.
const ParamSchema = z
  .string()
  .trim()
  .min(10, 'Token muito curto')
  .max(600, 'Token muito longo')

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params
    ParamSchema.parse(rawToken)
    return NextResponse.json({ data: { valid: true } })
  } catch (error) {
    return handleApiError(error)
  }
}
