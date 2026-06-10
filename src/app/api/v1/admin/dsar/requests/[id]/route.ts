import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AuthError, requireAdmin } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/rate-limiter'
import { errorResponse, AUTH_001, AUTH_002, AUTH_004, AUTH_006, SYS_001, DSAR_080 } from '@/constants/errors'
import { findDsarDetail } from '../_core'

interface RouteContext {
  params: Promise<{ id: string }>
}






export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireAdmin()
    const { id } = await context.params
    const detail = await findDsarDetail(id)

    if (!detail) {
      return NextResponse.json(errorResponse(DSAR_080), { status: 404 })
    }

    return successResponse({ request: detail })
  } catch (error) {
    return handleApiError(error)
  }
}





