import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { hashConsentReceipt, type ConsentSource } from '@/lib/consent-receipt'
import type { Prisma } from '@prisma/client'
import { buildStartWhere, buildDsarSummary, loadRelatedEvents } from './_core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export type DsarType = 'EXPORT' | 'DELETION'
export type DsarStatus =
  | 'REQUESTED'
  | 'PROCESSING'
  | 'EXPORT_READY'
  | 'DELETION_EXECUTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'
export type SlaState = 'OK' | 'DUE_SOON' | 'OVERDUE'

const DSAR_SLA_MS = 15 * 24 * 60 * 60 * 1000
const DUE_SOON_MS = 48 * 60 * 60 * 1000

const START_ACTIONS = ['profile.data_export_requested', 'user.deletion_requested'] as const
const DSAR_ACTIONS = [
  ...START_ACTIONS,
  'profile.data_exported',
  'user.deletion_cancelled',
  'user.deletion_completed',
  'admin.dsar.export_ready',
  'admin.dsar.deletion_executed',
  'admin.dsar.completed',
  'admin.dsar.failed',
  'admin.dsar.evidence_attached',
  'admin.dsar.receipt_downloaded',
] as const

const QuerySchema = z.object({
  status: z
    .enum(['REQUESTED', 'PROCESSING', 'EXPORT_READY', 'DELETION_EXECUTED', 'COMPLETED', 'FAILED', 'CANCELED'])
    .optional(),
  type: z.enum(['EXPORT', 'DELETION']).optional(),
  sla: z.enum(['OK', 'DUE_SOON', 'OVERDUE']).optional(),
  titular: z.string().trim().min(1).max(120).optional(),
  correlationId: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const AUDIT_SELECT = {
  id: true,
  userId: true,
  action: true,
  resource: true,
  resourceId: true,
  metadata: true,
  ipAddress: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      email: true,
      name: true,
      termsAcceptedAt: true,
      deletionRequestedAt: true,
    },
  },
} satisfies Prisma.AuditLogSelect

const CONSENT_SELECT = {
  id: true,
  version: true,
  categories: true,
  acceptedAt: true,
} as const

type AuditWithUser = Prisma.AuditLogGetPayload<{ select: typeof AUDIT_SELECT }>
type ConsentReceiptRow = Prisma.LandingConsentGetPayload<{ select: typeof CONSENT_SELECT }>

export interface DsarTimelineEvent {
  status: DsarStatus
  action: string
  at: string
  auditEventId: string
  correlationId: string | null
}

export interface DsarSummary {
  requestId: string
  type: DsarType
  status: DsarStatus
  requestedAt: string
  dueAt: string
  completedAt: string | null
  sla: SlaState
  correlationId: string | null
  subject: {
    userId: string | null
    name: string | null
    email: string | null
  }
  timeline: DsarTimelineEvent[]
  links: {
    detail: string
  }
}

export interface DsarDetail extends DsarSummary {
  evidence: {
    attachments: Array<{
      id: string
      type: string
      filename: string
      mimeType: string | null
      sizeBytes: number | null
      hash: string
      url: string | null
      note: string | null
      attachedAt: string
      auditEventId: string
      correlationId: string | null
      author: {
        userId: string | null
        name: string | null
        email: string | null
      }
    }>
    consentReceipts: Array<{
      receiptId: string
      policyVersion: string
      acceptedAt: string
      categories: string[]
      hash: string
      downloadUrl: string
    }>
    termsAcceptedAt: string | null
    auditEvents: Array<{
      id: string
      action: string
      resource: string
      resourceId: string | null
      createdAt: string
      correlationId: string | null
      author: {
        userId: string | null
        name: string | null
        email: string | null
      }
    }>
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const parsed = QuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const subjectFilter = parsed.titular

    const where = buildStartWhere({
      type: parsed.type,
      subject: subjectFilter,
      correlationId: parsed.correlationId,
    })

    const starts = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: AUDIT_SELECT,
    })

    const events = await loadRelatedEvents(starts)
    const summaries = starts
      .map((start) => buildDsarSummary(start, events.get(start.id) ?? []))
      .filter((item) => (parsed.status ? item.status === parsed.status : true))
      .filter((item) => (parsed.sla ? item.sla === parsed.sla : true))

    const total = summaries.length
    const offset = (parsed.page - 1) * parsed.limit
    const pageItems = summaries.slice(offset, offset + parsed.limit)

    return paginatedResponse(pageItems, { page: parsed.page, limit: parsed.limit, total })
  } catch (error) {
    return handleApiError(error)
  }
}

