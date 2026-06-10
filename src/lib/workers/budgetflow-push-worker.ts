import 'server-only'

import { prisma } from '@/lib/prisma'
import { serializeBudgetFlow, BUDGETFLOW_VERSION } from '@/lib/export/budgetflow-serializer'
import { captureException } from '@/lib/observability/sentry'
import type { Prisma } from '@prisma/client'

/**
 * Worker do push BudgetFlow (Task 52 / A18).
 *
 * Idempotente: so processa pushes em PENDING (claim atomico via updateMany).
 * Chamado por dois caminhos — inline best-effort no POST /push e pelo drain
 * da local-queue (kind 'budgetflow-push') como backstop; o claim garante que
 * apenas um dos dois executa.
 *
 * Delivery:
 *  - BUDGETFLOW_API_URL configurado -> POST do payload (Bearer
 *    BUDGETFLOW_API_TOKEN se presente). Nao-2xx lanca (retry via fila).
 *  - Sem BUDGETFLOW_API_URL -> COMPLETED com delivered=false e
 *    deliveryMode='manual-download' (payload persistido em `payload`;
 *    sem falso sucesso de entrega — Zero Silencio).
 */
export async function runBudgetFlowPush(pushId: string): Promise<void> {
  // Claim atomico: PENDING -> PROCESSING. count=0 => outro runner ja pegou
  // (ou estado terminal) — early-return idempotente.
  const claimed = await prisma.budgetFlowPush.updateMany({
    where: { id: pushId, status: 'PENDING' },
    data: { status: 'PROCESSING', attempts: { increment: 1 } },
  })
  if (claimed.count === 0) return

  const push = await prisma.budgetFlowPush.findUnique({ where: { id: pushId } })
  if (!push) return

  try {
    const leads = push.leadIds.length
      ? await prisma.lead.findMany({ where: { id: { in: push.leadIds }, userId: push.userId } })
      : []

    // Readiness re-check (lead pode ter sido removido entre POST e drain)
    if (leads.length !== push.leadIds.length) {
      const found = new Set(leads.map((l) => l.id))
      const missing = push.leadIds.filter((id) => !found.has(id))
      await prisma.budgetFlowPush.update({
        where: { id: pushId },
        data: {
          status: 'FAILED',
          error: `Leads indisponiveis no momento do push: ${missing.join(', ')}`,
        },
      })
      return
    }

    const payload = {
      version: BUDGETFLOW_VERSION,
      source: 'lead-hunting-engine' as const,
      exportedAt: new Date().toISOString(),
      provenance: {
        pushId: push.id,
        requestedBy: push.userId,
        requestedAt: push.createdAt.toISOString(),
        leadCount: leads.length,
      },
      campaign: {
        campaignId: push.campaignId,
        budget: Number(push.budget),
        currency: push.currency,
        note: push.note ?? null,
      },
      leads: leads.map((lead) => serializeBudgetFlow(lead).lead),
    }

    const apiUrl = process.env.BUDGETFLOW_API_URL
    if (apiUrl) {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.BUDGETFLOW_API_TOKEN
            ? { authorization: `Bearer ${process.env.BUDGETFLOW_API_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        throw new Error(`BudgetFlow API respondeu ${res.status}`)
      }
      const apiBody = (await res.json().catch(() => null)) as Prisma.InputJsonValue | null
      await prisma.budgetFlowPush.update({
        where: { id: pushId },
        data: {
          status: 'COMPLETED',
          delivered: true,
          deliveryMode: 'api',
          payload: payload as unknown as Prisma.InputJsonValue,
          result: { pushedAt: new Date().toISOString(), apiResponse: apiBody },
          error: null,
        },
      })
      return
    }

    await prisma.budgetFlowPush.update({
      where: { id: pushId },
      data: {
        status: 'COMPLETED',
        delivered: false,
        deliveryMode: 'manual-download',
        payload: payload as unknown as Prisma.InputJsonValue,
        result: {
          message:
            'BUDGETFLOW_API_URL nao configurado — payload gerado e disponivel para download manual.',
        },
        error: null,
      },
    })
  } catch (err) {
    captureException(err, { layer: 'budgetflow-push', pushId })
    // attempts < 4: volta para PENDING e a local-queue reprocessa com backoff.
    // attempts >= 4 (1 inline + 3 da fila): FAILED terminal — a UI de status
    // nunca congela em PENDING.
    const terminal = push.attempts + 1 >= 4
    await prisma.budgetFlowPush.update({
      where: { id: pushId },
      data: {
        status: terminal ? 'FAILED' : 'PENDING',
        error: (err as Error).message ?? String(err),
      },
    })
    throw err
  }
}
