import 'server-only'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { enqueue } from '@/lib/workers/local-queue'

/**
 * Service do fluxo dedicado BudgetFlow (Task 52 / A18).
 *
 * Compartilhado pelos routes /api/v1/integrations/budgetflow{,/push,/status}.
 * Estado vive em `budget_flow_pushes` (multi-instancia safe); o processamento
 * roda via local-queue kind 'budgetflow-push' com tentativa inline
 * best-effort no POST (worker idempotente — ver budgetflow-push-worker).
 */
export const BudgetFlowPushSchema = z.object({
  campaignId: z.string().trim().min(1, 'ID da campanha obrigatorio'),
  budget: z.string().min(1, 'Orcamento obrigatorio'),
  currency: z.enum(['BRL', 'USD', 'EUR']),
  note: z.string().max(500).optional(),
  // Mapeamento LHE -> BudgetFlow: leads anexados ao push (opcional)
  leadIds: z.array(z.string().uuid()).max(100).optional(),
})
export type BudgetFlowPushInput = z.infer<typeof BudgetFlowPushSchema>

export class BudgetFlowValidationError extends Error {
  code: string
  httpStatus: number
  constructor(code: string, message: string, httpStatus = 400) {
    super(message)
    this.code = code
    this.httpStatus = httpStatus
  }
}

/** Normaliza o budget string ("1.234,56") para numero positivo. */
export function normalizeBudget(budget: string): number {
  const value = Number(budget.replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'))
  if (Number.isNaN(value) || value <= 0) {
    throw new BudgetFlowValidationError(
      'BUDGET_INVALID',
      'O valor do orcamento deve ser um numero positivo.',
    )
  }
  return value
}

/** Readiness: todos os leadIds devem existir e pertencer ao usuario. */
export async function assertLeadsReady(userId: string, leadIds: string[]): Promise<void> {
  if (leadIds.length === 0) return
  const owned = await prisma.lead.findMany({
    where: { id: { in: leadIds }, userId },
    select: { id: true },
  })
  const ownedSet = new Set(owned.map((l) => l.id))
  const missing = leadIds.filter((id) => !ownedSet.has(id))
  if (missing.length > 0) {
    throw new BudgetFlowValidationError(
      'LEADS_NOT_READY',
      `Leads inexistentes ou de outro usuario: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`,
      422,
    )
  }
}

export interface BudgetFlowStatusView {
  jobId: string
  status: string
  delivered: boolean
  deliveryMode: string | null
  result: unknown
  error: string | null
  createdAt: string
  updatedAt: string
}

export async function getBudgetFlowStatus(
  userId: string,
  pushId: string,
): Promise<BudgetFlowStatusView | null> {
  const push = await prisma.budgetFlowPush.findFirst({
    where: { id: pushId, userId },
  })
  if (!push) return null
  return {
    jobId: push.id,
    status: push.status,
    delivered: push.delivered,
    deliveryMode: push.deliveryMode,
    result: push.result ?? null,
    error: push.error ?? null,
    createdAt: push.createdAt.toISOString(),
    updatedAt: push.updatedAt.toISOString(),
  }
}

/** Payload canonico gerado pelo worker (para download manual). */
export async function getBudgetFlowPayload(
  userId: string,
  pushId: string,
): Promise<unknown | null> {
  const push = await prisma.budgetFlowPush.findFirst({
    where: { id: pushId, userId },
    select: { payload: true, status: true },
  })
  if (!push || push.status !== 'COMPLETED') return null
  return push.payload ?? null
}

/**
 * Cria o push persistido, enfileira o processamento e tenta executar inline
 * (best-effort; a fila e o backstop em caso de crash/timeout).
 */
export async function createBudgetFlowPush(
  userId: string,
  input: BudgetFlowPushInput,
): Promise<{ jobId: string; status: string }> {
  const budgetValue = normalizeBudget(input.budget)
  const leadIds = input.leadIds ?? []
  await assertLeadsReady(userId, leadIds)

  const push = await prisma.budgetFlowPush.create({
    data: {
      userId,
      campaignId: input.campaignId,
      budget: budgetValue,
      currency: input.currency,
      note: input.note ?? null,
      leadIds,
    },
    select: { id: true },
  })

  await enqueue({ kind: 'budgetflow-push', payload: { pushId: push.id } })

  // Tentativa inline: resolve o push imediatamente no caminho feliz.
  // Falha aqui NAO derruba o request — a fila reprocessa (worker idempotente).
  let status = 'PENDING'
  try {
    const { runBudgetFlowPush } = await import('@/lib/workers/budgetflow-push-worker')
    await runBudgetFlowPush(push.id)
    const after = await prisma.budgetFlowPush.findUnique({
      where: { id: push.id },
      select: { status: true },
    })
    status = after?.status ?? 'PENDING'
  } catch {
    // fila reprocessa; status segue PENDING
  }

  return { jobId: push.id, status }
}
