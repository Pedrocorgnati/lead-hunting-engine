'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Routes } from '@/lib/constants'
import { Limits } from '@/lib/constants/limits'
import { LeadTemperature, CollectionJobStatus, LeadStatus } from '@/lib/constants/enums'
import type { Lead } from '@prisma/client'
import { getLeadTasksFromMetadata } from '@/lib/leads/lead-tasks'
import {
  resolveWhatsappLevel,
  summarizeChannelCoverage,
  type WhatsappLevel,
} from '@/lib/outreach/channel-metrics'
// ─── DTOs usados nas páginas (Server Components) ─────────────────────────────

export interface LeadSummary {
  id: string
  name: string
  city: string | null
  category: string | null
  // segmento de busca (ex.: "clínica médica") — mais útil que `category`, que é
  // o tipo cru do Google Places ("establishment" na maioria).
  niche: string | null
  // contato acionável (a coluna que faltava na lista). email é raro no ICP.
  phone: string | null
  email: string | null
  temperature: string
  opportunities: string[]
  score: number
  status: string
  createdAt: string
  // outreach-engine (06-10, task 29): prontidão de contato (chip green/yellow/
  // red derivado do integrityScore) e próxima ação sugerida (Lead.metadata).
  integrityScore: number | null
  nextAction: string | null
  nextActionLabel: string | null
}

function nextActionFromMetadata(metadata: unknown): { action: string | null; label: string | null } {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { action: null, label: null }
  }
  const m = metadata as Record<string, unknown>
  return {
    action: typeof m.nextAction === 'string' ? m.nextAction : null,
    label: typeof m.nextActionLabel === 'string' ? m.nextActionLabel : null,
  }
}

export interface DashboardStats {
  totalLeads: string
  hotLeads: string
  warmLeads: string
  coldLeads: string
  conversionRate: string
  activeJobs: string
  newLeads: string
  readyLeads: string
  contactableLeads: string
}

export interface DashboardReminder {
  taskId: string
  leadId: string
  leadName: string
  title: string
  dueAt: string
}

export interface LeadDetailView {
  id: string
  name: string
  city: string | null
  state: string | null
  phone: string | null
  website: string | null
  email: string | null
  category: string | null
  instagramHandle: string | null
  score: number
  temperature: string
  opportunities: string[]
  status: string
  notes: string | null
  contactedAt: Date | null
  scoreBreakdown: unknown
  pitchContent: string | null
  pitchTone: string | null
  createdAt: Date
  updatedAt: Date
  provenance: {
    id: string
    field: string
    source: string
    sourceUrl: string | null
    collectedAt: Date
    confidence: unknown
  }[]
  // TASK-3 intake-review: sinais estruturados
  isWhatsappChannel: boolean | null
  // W9 (blacksmith 06-11, criterio 19): nivel do sinal WhatsApp ao lado da
  // flag legada — 'probable' NUNCA pode ser exibido como confirmado.
  whatsappLevel: WhatsappLevel
  hasEcommerce: boolean | null
  ecommercePlatform: string | null
  analyticsPixels: string[]
  // TASK-4 intake-review: sinais de oportunidade granulares
  signals: string[]
}

// ─── Helper interno para obter userId autenticado ────────────────────────────

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(Routes.LOGIN)
  return user.id
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const userId = await getAuthenticatedUserId()

  const [
    totalLeads,
    hotLeads,
    warmLeads,
    coldLeads,
    convertedLeads,
    activeJobs,
    newLeads,
    readyLeads,
    contactableLeads,
  ] = await Promise.all([
    prisma.lead.count({ where: { userId } }),
    prisma.lead.count({ where: { userId, temperature: LeadTemperature.HOT } }),
    prisma.lead.count({ where: { userId, temperature: LeadTemperature.WARM } }),
    prisma.lead.count({ where: { userId, temperature: LeadTemperature.COLD } }),
    prisma.lead.count({ where: { userId, status: LeadStatus.CONVERTED } }),
    prisma.collectionJob.count({
      where: {
        userId,
        status: { in: [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING] },
      },
    }),
    prisma.lead.count({ where: { userId, status: LeadStatus.NEW } }),
    prisma.lead.count({
      where: {
        userId,
        status: { in: [LeadStatus.NEW, LeadStatus.CONTACTED] },
        integrityScore: { gte: 60 },
      },
    }),
    prisma.lead.count({
      where: {
        userId,
        OR: [
          { email: { not: null } },
          { phone: { not: null } },
        ],
      },
    }),
  ])

  const conversionRate = totalLeads > 0
    ? Math.round((convertedLeads / totalLeads) * 100)
    : 0

  return {
    totalLeads: String(totalLeads),
    hotLeads: String(hotLeads),
    warmLeads: String(warmLeads),
    coldLeads: String(coldLeads),
    conversionRate: `${conversionRate}%`,
    activeJobs: String(activeJobs),
    newLeads: String(newLeads),
    readyLeads: String(readyLeads),
    contactableLeads: String(contactableLeads),
  }
}

export async function getRecentLeads(): Promise<LeadSummary[]> {
  const userId = await getAuthenticatedUserId()

  const leads = await prisma.lead.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      businessName: true,
      city: true,
      category: true,
      niche: true,
      phone: true,
      email: true,
      temperature: true,
      opportunities: true,
      score: true,
      status: true,
      createdAt: true,
      integrityScore: true,
      metadata: true,
    },
  })

  return leads.map((l) => {
    const next = nextActionFromMetadata(l.metadata)
    return {
      id: l.id,
      name: l.businessName,
      city: l.city,
      category: l.category,
      niche: l.niche,
      phone: l.phone,
      email: l.email,
      temperature: l.temperature,
      opportunities: l.opportunities,
      score: l.score,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
      integrityScore: l.integrityScore,
      nextAction: next.action,
      nextActionLabel: next.label,
    }
  })
}

export async function getUpcomingLeadReminders(limit = 5): Promise<DashboardReminder[]> {
  const userId = await getAuthenticatedUserId()

  const leads = await prisma.lead.findMany({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      metadata: true,
    },
  })

  const reminders = leads
    .flatMap((lead) => {
      return getLeadTasksFromMetadata(lead.metadata).flatMap((task) => {
        if (task.completed || !task.dueAt) return []
        return {
          taskId: task.id,
          leadId: lead.id,
          leadName: lead.businessName,
          title: task.title,
          dueAt: task.dueAt,
        }
      })
    })
    .filter((reminder) => new Date(reminder.dueAt) >= new Date())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())

  return reminders.slice(0, limit)
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function getLeads(params?: {
  page?: number
  search?: string
  type?: string
  status?: string
  city?: string
  /** M12/G-001: filtro por niche (mapeia para Lead.category) */
  niche?: string
  /** M12/G-001: filtro por temperatura (COLD|WARM|HOT) */
  temperature?: string
  scoreMin?: number
  scoreMax?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  /** CL-174: filtro rapido de janela temporal (24h | 7d | 30d) */
  recency?: '24h' | '7d' | '30d'
  // outreach-engine (06-10, fix da revisao): filtros operacionais de prontidao.
  /** so leads com e-mail (alvos enviaveis) */
  hasEmail?: boolean
  /** so leads SEM site (o gancho central: A_NEEDS_SITE) */
  noSite?: boolean
  /** prontos para auto-outbound: com e-mail + integridade >= limiar */
  ready?: boolean
}): Promise<{
  data: LeadSummary[]
  total: number
  pages: number
  // Review 06-11 R1-2 (criterio 19): a metrica antiga `withWhatsapp` contava
  // celular BR (nivel 'probable') sem qualificador — 'probable' NUNCA pode
  // ser exibido/contado como WhatsApp confirmado. Agora os dois niveis saem
  // separados (via computeChannelFacts/summarizeChannelCoverage).
  coverage: {
    withPhone: number
    withWhatsappConfirmed: number
    withWhatsappProbable: number
    withEmail: number
  }
}> {
  const userId = await getAuthenticatedUserId()

  const page = Math.max(1, params?.page ?? 1)
  const limit = Limits.PAGE_SIZE
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { userId }
  if (params?.status) where.status = params.status
  if (params?.type) where.opportunities = { has: params.type }
  if (params?.city) where.city = { contains: params.city, mode: 'insensitive' }
  if (params?.niche) where.category = { contains: params.niche, mode: 'insensitive' }
  if (params?.temperature) where.temperature = params.temperature
  if (params?.recency) {
    const hoursMap = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 } as const
    const hours = hoursMap[params.recency]
    where.createdAt = { gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
  }
  if (params?.search) {
    where.OR = [
      { businessName: { contains: params.search, mode: 'insensitive' } },
      { city: { contains: params.search, mode: 'insensitive' } },
      { category: { contains: params.search, mode: 'insensitive' } },
    ]
  }
  if (params?.scoreMin !== undefined || params?.scoreMax !== undefined) {
    where.score = {
      ...(params.scoreMin !== undefined ? { gte: params.scoreMin } : {}),
      ...(params.scoreMax !== undefined ? { lte: params.scoreMax } : {}),
    }
  }
  // Filtros operacionais de prontidao para outreach (fix da revisao):
  // "tem e-mail" (alvo enviavel), "sem site" (o gancho A_NEEDS_SITE),
  // "pronto" (e-mail + integridade >= limiar).
  if (params?.hasEmail || params?.ready) where.email = { not: null }
  if (params?.noSite) where.website = null
  if (params?.ready) where.integrityScore = { gte: 60 }

  const validSortFields: Record<string, string> = {
    score: 'score',
    createdAt: 'createdAt',
    businessName: 'businessName',
    temperature: 'temperature',
  }
  const safeSortBy = params?.sortBy && validSortFields[params.sortBy] ? params.sortBy : 'createdAt'
  const orderBy = { [safeSortBy]: params?.sortOrder ?? 'desc' }

  const [leads, total, coverageRows] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy,
      take: limit,
      skip,
      select: {
        id: true,
        businessName: true,
        city: true,
        category: true,
        niche: true,
        phone: true,
        email: true,
        temperature: true,
        opportunities: true,
        score: true,
        status: true,
        createdAt: true,
        integrityScore: true,
        metadata: true,
      },
    }),
    prisma.lead.count({ where }),
    // Cobertura de contato HONESTA (filtro-escopada) via computeChannelFacts:
    // separa WhatsApp confirmado (evidencia HTML) de provavel (celular BR) —
    // criterios 17/19 (review 06-11 R1-1/R1-2). Select minimo por linha.
    prisma.lead.findMany({
      where,
      select: {
        phone: true,
        phoneNormalized: true,
        email: true,
        website: true,
        isWhatsappChannel: true,
        enrichmentData: true,
      },
    }),
  ])

  const channelCoverage = summarizeChannelCoverage(coverageRows)

  return {
    data: leads.map((l) => {
      const next = nextActionFromMetadata(l.metadata)
      return {
        id: l.id,
        name: l.businessName,
        city: l.city,
        category: l.category,
        niche: l.niche,
        phone: l.phone,
        email: l.email,
        temperature: l.temperature,
        opportunities: l.opportunities,
        score: l.score,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
        integrityScore: l.integrityScore,
        nextAction: next.action,
        nextActionLabel: next.label,
      }
    }),
    total,
    pages: Math.ceil(total / limit),
    coverage: {
      withPhone: channelCoverage.withPhone,
      withWhatsappConfirmed: channelCoverage.withWhatsappConfirmed,
      withWhatsappProbable: channelCoverage.withWhatsappProbable,
      withEmail: channelCoverage.withEmail,
    },
  }
}

export async function getLead(id: string): Promise<LeadDetailView | null> {
  const userId = await getAuthenticatedUserId()

  const lead = await prisma.lead.findFirst({
    where: { id, userId },
    include: {
      dataProvenance: {
        orderBy: { collectedAt: 'desc' },
        select: {
          id: true,
          field: true,
          source: true,
          sourceUrl: true,
          collectedAt: true,
          confidence: true,
        },
      },
    },
  })

  if (!lead) return null

  return {
    id: lead.id,
    name: lead.businessName,
    city: lead.city,
    state: lead.state,
    phone: lead.phone,
    website: lead.website,
    email: lead.email,
    category: lead.category,
    instagramHandle: lead.instagramHandle,
    score: lead.score,
    temperature: lead.temperature,
    opportunities: lead.opportunities,
    status: lead.status,
    notes: lead.notes,
    contactedAt: lead.contactedAt,
    scoreBreakdown: lead.scoreBreakdown,
    pitchContent: lead.pitchContent,
    pitchTone: lead.pitchTone,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    isWhatsappChannel: lead.isWhatsappChannel ?? null,
    whatsappLevel: resolveWhatsappLevel({
      isWhatsappChannel: lead.isWhatsappChannel,
      phoneNormalized: lead.phoneNormalized,
      enrichmentData: lead.enrichmentData,
    }),
    hasEcommerce: lead.hasEcommerce ?? null,
    ecommercePlatform: lead.ecommercePlatform ?? null,
    analyticsPixels: lead.analyticsPixels ?? [],
    signals: lead.signals ?? [],
    provenance: lead.dataProvenance.map((p) => ({
      id: p.id,
      field: p.field,
      source: p.source,
      sourceUrl: p.sourceUrl,
      collectedAt: p.collectedAt,
      confidence: p.confidence,
    })),
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<{ success: boolean }> {
  const userId = await getAuthenticatedUserId()

  const lead = await prisma.lead.findFirst({ where: { id, userId }, select: { id: true } })
  if (!lead) throw new Error('Lead não encontrado')

  await prisma.lead.update({
    where: { id },
    data: {
      status: status as unknown as Lead['status'],
      ...(status === LeadStatus.CONTACTED ? { contactedAt: new Date() } : {}),
    },
  })

  return { success: true }
}

export async function updateLeadNotes(id: string, notes: string): Promise<{ success: boolean }> {
  const userId = await getAuthenticatedUserId()

  const lead = await prisma.lead.findFirst({ where: { id, userId }, select: { id: true } })
  if (!lead) throw new Error('Lead não encontrado')

  await prisma.lead.update({ where: { id }, data: { notes } })
  return { success: true }
}

export async function exportLeads(params?: {
  status?: string
  city?: string
  search?: string
  scoreMin?: number
  scoreMax?: number
}): Promise<{ csv: string; count: number }> {
  const userId = await getAuthenticatedUserId()

  const where: Record<string, unknown> = { userId }
  if (params?.status) where.status = params.status
  if (params?.city) where.city = { contains: params.city, mode: 'insensitive' }
  if (params?.search) {
    where.OR = [
      { businessName: { contains: params.search, mode: 'insensitive' } },
      { city: { contains: params.search, mode: 'insensitive' } },
    ]
  }
  if (params?.scoreMin !== undefined || params?.scoreMax !== undefined) {
    where.score = {
      ...(params.scoreMin !== undefined ? { gte: params.scoreMin } : {}),
      ...(params.scoreMax !== undefined ? { lte: params.scoreMax } : {}),
    }
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { score: 'desc' },
    take: Limits.MAX_COLLECTION_SIZE,
    select: {
      id: true,
      businessName: true,
      category: true,
      city: true,
      state: true,
      phone: true,
      website: true,
      email: true,
      score: true,
      temperature: true,
      opportunities: true,
      status: true,
      createdAt: true,
    },
  })

  const csvEscape = (val: unknown): string => {
    if (val === null || val === undefined) return ''
    const str = Array.isArray(val) ? val.join(';') : String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const headers = ['ID', 'Nome', 'Categoria', 'Cidade', 'Estado', 'Telefone', 'Site', 'Email', 'Score', 'Temperatura', 'Oportunidades', 'Status', 'Criado em']
  const rows = leads.map((l) =>
    [
      l.id, l.businessName, l.category, l.city, l.state,
      l.phone, l.website, l.email, l.score, l.temperature,
      l.opportunities, l.status, l.createdAt.toISOString().split('T')[0],
    ].map(csvEscape).join(',')
  )

  return {
    csv: [headers.join(','), ...rows].join('\n'),
    count: leads.length,
  }
}
