'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Routes } from '@/lib/constants'
import { Limits } from '@/lib/constants/limits'
import { LeadTemperature, CollectionJobStatus, LeadStatus } from '@/lib/constants/enums'
import type { Lead } from '@prisma/client'
// ─── DTOs usados nas páginas (Server Components) ─────────────────────────────

export interface LeadSummary {
  id: string
  name: string
  city: string | null
  category: string | null
  temperature: string
  opportunities: string[]
  score: number
  status: string
  createdAt: string
}

export interface DashboardStats {
  totalLeads: string
  hotLeads: string
  warmLeads: string
  coldLeads: string
  conversionRate: string
  activeJobs: string
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

  const [totalLeads, hotLeads, warmLeads, coldLeads, convertedLeads, activeJobs] = await Promise.all([
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
      temperature: true,
      opportunities: true,
      score: true,
      status: true,
      createdAt: true,
    },
  })

  return leads.map((l) => ({
    id: l.id,
    name: l.businessName,
    city: l.city,
    category: l.category,
    temperature: l.temperature,
    opportunities: l.opportunities,
    score: l.score,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
  }))
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export async function getLeads(params?: {
  page?: number
  search?: string
  type?: string
  status?: string
  city?: string
  scoreMin?: number
  scoreMax?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  /** CL-174: filtro rapido de janela temporal (24h | 7d | 30d) */
  recency?: '24h' | '7d' | '30d'
}): Promise<{ data: LeadSummary[]; total: number; pages: number }> {
  const userId = await getAuthenticatedUserId()

  const page = Math.max(1, params?.page ?? 1)
  const limit = Limits.PAGE_SIZE
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { userId }
  if (params?.status) where.status = params.status
  if (params?.type) where.opportunities = { has: params.type }
  if (params?.city) where.city = { contains: params.city, mode: 'insensitive' }
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

  const validSortFields: Record<string, string> = {
    score: 'score',
    createdAt: 'createdAt',
    businessName: 'businessName',
    temperature: 'temperature',
  }
  const safeSortBy = params?.sortBy && validSortFields[params.sortBy] ? params.sortBy : 'createdAt'
  const orderBy = { [safeSortBy]: params?.sortOrder ?? 'desc' }

  const [leads, total] = await Promise.all([
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
        temperature: true,
        opportunities: true,
        score: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.lead.count({ where }),
  ])

  return {
    data: leads.map((l) => ({
      id: l.id,
      name: l.businessName,
      city: l.city,
      category: l.category,
      temperature: l.temperature,
      opportunities: l.opportunities,
      score: l.score,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
    })),
    total,
    pages: Math.ceil(total / limit),
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
