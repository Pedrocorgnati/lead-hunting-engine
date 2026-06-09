import { NextRequest } from 'next/server'
import { executeProviderOperation } from '../_provider-operations'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params
  return executeProviderOperation(request, provider, 'force-fallback')
}
