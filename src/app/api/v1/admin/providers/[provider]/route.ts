import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-utils'
import { executeProviderOperation } from './_provider-operations'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const body = await request.json().catch(() => ({}))
    const operation = z.enum(['pause', 'resume', 'force-fallback']).parse(body.operation)
    const replay = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(body),
    })
    const { provider } = await params
    return executeProviderOperation(replay, provider, operation)
  } catch (error) {
    return handleApiError(error)
  }
}

export function GET() {
  return NextResponse.json(
    {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use POST /pause, /resume ou /force-fallback para operar providers.',
      },
    },
    { status: 405 },
  )
}
