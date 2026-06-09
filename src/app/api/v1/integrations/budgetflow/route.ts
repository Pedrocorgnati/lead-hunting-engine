import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { randomUUID } from 'crypto'

const PushSchema = z.object({
  campaignId: z.string().trim().min(1, 'ID da campanha obrigatorio'),
  budget: z.string().min(1, 'Orcamento obrigatorio'),
  currency: z.enum(['BRL', 'USD', 'EUR']),
  note: z.string().max(500).optional(),
})

type PushStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

interface BudgetFlowJob {
  id: string
  status: PushStatus
  payload: unknown
  createdAt: string
  updatedAt: string
  result?: unknown
  error?: string
}

// Store em memoria para status de pushes (hipotese: em producao migrar para DB ou fila)
const budgetFlowJobs = new Map<string, BudgetFlowJob>()

/**
 * POST /api/v1/integrations/budgetflow/push
 *
 * Envia payload BudgetFlow para processamento.
 * Retorna jobId para polling de status.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth()

    const body = await request.json()
    const data = PushSchema.parse(body)

    const jobId = randomUUID()
    const now = new Date().toISOString()
    const job: BudgetFlowJob = {
      id: jobId,
      status: 'PENDING',
      payload: data,
      createdAt: now,
      updatedAt: now,
    }
    budgetFlowJobs.set(jobId, job)

    // Simula transicao para PROCESSING apos criacao
    setTimeout(() => {
      const j = budgetFlowJobs.get(jobId)
      if (j && j.status === 'PENDING') {
        j.status = 'PROCESSING'
        j.updatedAt = new Date().toISOString()
      }
    }, 500)

    // Simula conclusao apos 3s (hipotese: em producao usar fila real)
    setTimeout(() => {
      const j = budgetFlowJobs.get(jobId)
      if (j && j.status === 'PROCESSING') {
        j.status = 'COMPLETED'
        j.updatedAt = new Date().toISOString()
        j.result = { pushedAt: j.updatedAt, campaignId: data.campaignId }
      }
    }, 3000)

    return successResponse({ jobId, status: 'PENDING', message: 'BudgetFlow enviado para processamento.' }, 202)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * GET /api/v1/integrations/budgetflow/status?id=<jobId>
 *
 * Retorna status de um push BudgetFlow pelo jobId.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('id')

    if (!jobId) {
      return NextResponse.json(
        { error: { code: 'MISSING_PARAM', message: 'Parametro id obrigatorio.' } },
        { status: 400 }
      )
    }

    const job = budgetFlowJobs.get(jobId)
    if (!job) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Job nao encontrado.' } },
        { status: 404 }
      )
    }

    return successResponse({
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      result: job.result ?? null,
      error: job.error ?? null,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
