import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { handleApiError, paginatedResponse } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { hashConsentReceipt, type ConsentSource } from '@/lib/consent-receipt'
import type { Prisma } from '@prisma/client'

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

export async function findDsarDetail(requestId: string): Promise<DsarDetail | null> {
  const start = await prisma.auditLog.findFirst({
    where: {
      id: requestId,
      action: { in: [...START_ACTIONS] },
    },
    select: AUDIT_SELECT,
  })

  if (!start) return null

  const events = await findEventsForStart(start)
  const summary = buildDsarSummary(start, events)
  const receipts = start.user?.email ? await findConsentReceiptsForEmail(start.user.email) : []

  return {
    ...summary,
    evidence: {
      attachments: events
        .filter((event) => event.action === 'admin.dsar.evidence_attached')
        .map(toDsarEvidenceAttachment)
        .filter((attachment): attachment is NonNullable<ReturnType<typeof toDsarEvidenceAttachment>> =>
          Boolean(attachment),
        ),
      consentReceipts: receipts.map(toReceiptEvidence),
      termsAcceptedAt: start.user?.termsAcceptedAt?.toISOString() ?? null,
      auditEvents: [start, ...events].map((event) => ({
        id: event.id,
        action: event.action,
        resource: event.resource,
        resourceId: event.resourceId,
        createdAt: event.createdAt.toISOString(),
        correlationId: metadataString(event.metadata, 'correlationId'),
        author: {
          userId: event.userId,
          name: event.user?.name ?? null,
          email: event.user?.email ?? null,
        },
      })),
    },
  }
}

export function buildStartWhere(input: {
  type?: DsarType
  subject?: string
  correlationId?: string
}): Prisma.AuditLogWhereInput {
  const actionIn =
    input.type === 'EXPORT'
      ? ['profile.data_export_requested']
      : input.type === 'DELETION'
        ? ['user.deletion_requested']
        : [...START_ACTIONS]

  const where: Prisma.AuditLogWhereInput = {
    action: { in: actionIn },
  }

  if (input.subject) {
    where.user = {
      is: {
        OR: [
          { email: { contains: input.subject, mode: 'insensitive' } },
          { name: { contains: input.subject, mode: 'insensitive' } },
        ],
      },
    }
  }

  if (input.correlationId) {
    where.metadata = {
      path: ['correlationId'],
      equals: input.correlationId,
    }
  }

  return where
}

async function loadRelatedEvents(starts: AuditWithUser[]): Promise<Map<string, AuditWithUser[]>> {
  const byStart = new Map<string, AuditWithUser[]>()
  const groupedByUser = new Map<string, AuditWithUser[]>()
  const userIds = Array.from(new Set(starts.map((start) => start.userId).filter((id): id is string => Boolean(id))))
  const requestIds = starts.map((start) => start.id)

  if (userIds.length === 0 && requestIds.length === 0) return byStart

  const events = await prisma.auditLog.findMany({
    where: {
      action: { in: [...DSAR_ACTIONS] },
      OR: [
        ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
        ...(requestIds.length > 0
          ? [
              {
                resource: 'dsar_request',
                resourceId: { in: requestIds },
              },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 5000,
    select: AUDIT_SELECT,
  })

  for (const event of events) {
    if (!event.userId) continue
    const list = groupedByUser.get(event.userId) ?? []
    list.push(event)
    groupedByUser.set(event.userId, list)
  }

  for (const start of starts) {
    byStart.set(start.id, eventsForStart(start, groupedByUser.get(start.userId ?? '') ?? []))
  }

  return byStart
}

async function findEventsForStart(start: AuditWithUser): Promise<AuditWithUser[]> {
  if (!start.userId) return []

  const events = await prisma.auditLog.findMany({
    where: {
      action: { in: [...DSAR_ACTIONS] },
      createdAt: { gte: start.createdAt },
      OR: [
        { userId: start.userId },
        {
          resource: 'dsar_request',
          resourceId: start.id,
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: AUDIT_SELECT,
  })

  return eventsForStart(start, events)
}

function eventsForStart(start: AuditWithUser, events: AuditWithUser[]): AuditWithUser[] {
  const nextStart = events.find(
    (event) =>
      event.id !== start.id &&
      START_ACTIONS.includes(event.action as (typeof START_ACTIONS)[number]) &&
      event.createdAt > start.createdAt,
  )

  return events.filter((event) => {
    if (event.id === start.id) return false
    if (event.createdAt < start.createdAt) return false
    if (nextStart && event.createdAt >= nextStart.createdAt) return false
    const eventRequestId = metadataString(event.metadata, 'requestId')
    return event.resourceId === start.id || !eventRequestId || eventRequestId === start.id
  })
}

export function buildDsarSummary(start: AuditWithUser, events: AuditWithUser[], now = new Date()): DsarSummary {
  const type = actionToType(start.action)
  const timeline = buildTimeline(start, events, type)
  const status = timeline.at(-1)?.status ?? 'REQUESTED'
  const completedAt = isTerminalStatus(status) ? timeline.at(-1)?.at ?? null : null
  const dueAt = new Date(start.createdAt.getTime() + DSAR_SLA_MS)

  return {
    requestId: start.id,
    type,
    status,
    requestedAt: start.createdAt.toISOString(),
    dueAt: dueAt.toISOString(),
    completedAt,
    sla: computeSla(status, dueAt, now),
    correlationId: metadataString(start.metadata, 'correlationId'),
    subject: {
      userId: start.userId,
      name: maskName(start.user?.name ?? null),
      email: maskEmail(start.user?.email ?? null),
    },
    timeline,
    links: {
      detail: `/api/v1/admin/dsar/requests/${start.id}`,
    },
  }
}

function buildTimeline(start: AuditWithUser, events: AuditWithUser[], type: DsarType): DsarTimelineEvent[] {
  const timeline: DsarTimelineEvent[] = [
    {
      status: 'REQUESTED',
      action: start.action,
      at: start.createdAt.toISOString(),
      auditEventId: start.id,
      correlationId: metadataString(start.metadata, 'correlationId'),
    },
  ]

  const startMetadataStatus = metadataString(start.metadata, 'status')
  const completedAt = metadataString(start.metadata, 'completed_at')

  for (const event of events) {
    const status = eventToStatus(event.action, type)
    if (!status) continue
    timeline.push({
      status,
      action: event.action,
      at: event.createdAt.toISOString(),
      auditEventId: event.id,
      correlationId: metadataString(event.metadata, 'correlationId'),
    })
  }

  if (type === 'EXPORT' && (startMetadataStatus === 'COMPLETED' || completedAt)) {
    const at = completedAt ?? start.createdAt.toISOString()
    ensureTimelineStatus(timeline, 'EXPORT_READY', 'profile.data_export_ready', at, start)
    ensureTimelineStatus(timeline, 'COMPLETED', 'profile.data_export_completed', at, start)
  }

  return dedupeTimeline(timeline)
}

function eventToStatus(action: string, type: DsarType): DsarStatus | null {
  if (action === 'profile.data_exported' || action === 'admin.dsar.export_ready') return 'EXPORT_READY'
  if (action === 'admin.dsar.deletion_executed') return 'DELETION_EXECUTED'
  if (action === 'user.deletion_completed' && type === 'DELETION') return 'COMPLETED'
  if (action === 'admin.dsar.completed') return 'COMPLETED'
  if (action === 'admin.dsar.failed') return 'FAILED'
  if (action === 'user.deletion_cancelled') return 'CANCELED'
  return null
}

function ensureTimelineStatus(
  timeline: DsarTimelineEvent[],
  status: DsarStatus,
  action: string,
  at: string,
  source: AuditWithUser,
) {
  if (timeline.some((event) => event.status === status)) return
  timeline.push({
    status,
    action,
    at,
    auditEventId: `${source.id}-synthetic-${status.toLowerCase()}`,
    correlationId: metadataString(source.metadata, 'correlationId'),
  })
}

function dedupeTimeline(timeline: DsarTimelineEvent[]): DsarTimelineEvent[] {
  const seen = new Set<string>()
  return timeline
    .sort((a, b) => a.at.localeCompare(b.at))
    .filter((event) => {
      const key = `${event.status}:${event.auditEventId}:${event.at}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

async function findConsentReceiptsForEmail(email: string): Promise<ConsentReceiptRow[]> {
  const [waitlist, contacts] = await Promise.all([
    prisma.waitlistEntry.findMany({
      where: { email },
      select: { id: true, consentId: true },
    }),
    prisma.contactMessage.findMany({
      where: { email },
      select: { id: true, consentId: true },
    }),
  ])

  const consentIds = Array.from(
    new Set(
      [...waitlist, ...contacts]
        .map((entry) => entry.consentId)
        .filter((id): id is string => Boolean(id)),
    ),
  )
  const waitlistIds = waitlist.map((entry) => entry.id)
  const contactIds = contacts.map((entry) => entry.id)

  if (consentIds.length === 0 && waitlistIds.length === 0 && contactIds.length === 0) return []

  return prisma.landingConsent.findMany({
    where: {
      OR: [
        ...(consentIds.length > 0 ? [{ id: { in: consentIds } }] : []),
        ...(waitlistIds.length > 0 ? [{ waitlistEntryId: { in: waitlistIds } }] : []),
        ...(contactIds.length > 0 ? [{ contactMessageId: { in: contactIds } }] : []),
      ],
    },
    orderBy: { acceptedAt: 'desc' },
    select: CONSENT_SELECT,
  })
}

function toReceiptEvidence(receipt: ConsentReceiptRow) {
  const source = receipt as ConsentSource
  const hash = hashConsentReceipt(source)
  const downloadToken = Buffer.from(`${receipt.id}.${hash}`).toString('base64url')
  return {
    receiptId: receipt.id,
    policyVersion: receipt.version,
    acceptedAt: receipt.acceptedAt.toISOString(),
    categories: receipt.categories,
    hash,
    downloadUrl: `/api/v1/consent/receipt?receiptId=${encodeURIComponent(receipt.id)}&format=download`,
    downloadToken,
  }
}

function actionToType(action: string): DsarType {
  return action === 'user.deletion_requested' ? 'DELETION' : 'EXPORT'
}

function metadataString(metadata: Prisma.JsonValue | null, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function metadataNumber(metadata: Prisma.JsonValue | null, key: string): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function metadataObject(metadata: Prisma.JsonValue | null, key: string): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function objectString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key]
  return typeof field === 'string' && field.trim() ? field : null
}

function objectNumber(value: Record<string, unknown>, key: string): number | null {
  const field = value[key]
  return typeof field === 'number' && Number.isFinite(field) ? field : null
}

function toDsarEvidenceAttachment(event: AuditWithUser) {
  const evidence = metadataObject(event.metadata, 'evidence')
  if (!evidence) return null

  const filename = objectString(evidence, 'filename')
  const hash = objectString(evidence, 'hash')
  const type = objectString(evidence, 'type') ?? metadataString(event.metadata, 'evidenceType')

  if (!filename || !hash || !type) return null

  return {
    id: objectString(evidence, 'id') ?? event.id,
    type,
    filename,
    mimeType: objectString(evidence, 'mimeType'),
    sizeBytes: objectNumber(evidence, 'sizeBytes') ?? metadataNumber(event.metadata, 'sizeBytes'),
    hash,
    url: objectString(evidence, 'url'),
    note: objectString(evidence, 'note'),
    attachedAt: event.createdAt.toISOString(),
    auditEventId: event.id,
    correlationId: metadataString(event.metadata, 'correlationId'),
    author: {
      userId: event.userId,
      name: event.user?.name ?? null,
      email: event.user?.email ?? null,
    },
  }
}

function maskEmail(email: string | null): string | null {
  if (!email) return null
  const [local, domain] = email.split('@')
  if (!local || !domain) return null
  const visibleLocal = local.slice(0, 2)
  const domainParts = domain.split('.')
  const domainName = domainParts[0] ?? ''
  const suffix = domainParts.slice(1).join('.')
  const maskedDomain = `${domainName.slice(0, 1)}***${suffix ? `.${suffix}` : ''}`
  return `${visibleLocal}${'*'.repeat(Math.max(2, local.length - 2))}@${maskedDomain}`
}

function maskName(name: string | null): string | null {
  if (!name) return null
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1)}${'*'.repeat(Math.max(2, part.length - 1))}`)
    .join(' ')
}

function computeSla(status: DsarStatus, dueAt: Date, now: Date): SlaState {
  if (isTerminalStatus(status)) return 'OK'
  const remaining = dueAt.getTime() - now.getTime()
  if (remaining < 0) return 'OVERDUE'
  if (remaining <= DUE_SOON_MS) return 'DUE_SOON'
  return 'OK'
}

function isTerminalStatus(status: DsarStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELED'
}
