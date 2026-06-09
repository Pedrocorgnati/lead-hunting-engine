import { NextRequest } from 'next/server'
import { executeDsarMutation } from '../route'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return executeDsarMutation(request, context, 'execute-export')
}
