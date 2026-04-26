import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { errorResponse, SYS_001 } from '@/constants/errors'
import { handleAuthError, AuthError } from '@/lib/auth'
import { RateLimitError } from '@/lib/rate-limiter'

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
  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: { code: 'RATE_001', message: error.message } },
      {
        status: 429,
        headers: {
          'Retry-After': String(error.retryAfter),
          'X-RateLimit-Reset': String(error.reset),
        },
      }
    )
  }

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

  // Erros estruturados com code + httpStatus (ex: JOB_050 do jobService)
  if (
    error instanceof Error &&
    'code' in error &&
    'httpStatus' in error &&
    typeof (error as { httpStatus: unknown }).httpStatus === 'number'
  ) {
    const { code, httpStatus, details } = error as {
      code: string
      httpStatus: number
      details?: unknown
    }
    const payload: { error: { code: string; message: string; details?: unknown } } = {
      error: { code, message: error.message },
    }
    if (details !== undefined) payload.error.details = details
    return NextResponse.json(payload, { status: httpStatus })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error('[API Error]', error)
  }
  return NextResponse.json(errorResponse(SYS_001), { status: 500 })
}
