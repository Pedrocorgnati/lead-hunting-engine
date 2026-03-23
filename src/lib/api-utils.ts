import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { errorResponse, SYS_001 } from '@/constants/errors'
import { handleAuthError, AuthError } from '@/lib/auth'

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status })
}

export function paginatedResponse<T>(data: T[], meta: { page: number; limit: number; total: number }) {
  return NextResponse.json({
    data,
    meta: {
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      hasNext: meta.page * meta.limit < meta.total,
      hasPrev: meta.page > 1,
    },
  })
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return handleAuthError(error)
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos.',
          details: error.issues.map((e) => `${String(e.path?.join('.') ?? '')}: ${e.message}`).join('; '),
        },
      },
      { status: 400 }
    )
  }

  console.error('[API Error]', error)
  return NextResponse.json(errorResponse(SYS_001), { status: 500 })
}
