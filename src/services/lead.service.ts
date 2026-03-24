import { prisma } from '@/lib/prisma'
import { Limits } from '@/lib/constants/limits'
import { LeadTemperature, CollectionJobStatus } from '@/lib/constants/enums'
import type {
  LeadListQuery,
  UpdateLeadStatusInput,
  UpdateLeadNotesInput,
  UpdateLeadPitchInput,
  RegeneratePitchInput,
  MarkFalsePositiveInput,
} from '@/schemas/lead.schema'
import type { Lead } from '@prisma/client'

const LEAD_SUMMARY_SELECT = {
  id: true,
  businessName: true,
  category: true,
  city: true,
  state: true,
  phone: true,
  website: true,
  score: true,
  temperature: true,
  opportunities: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const

export class LeadService {
  async findAll(
    userId: string,
    query: LeadListQuery,
  ): Promise<{ data: Lead[]; total: number }> {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      city,
      niche,
      status,
      temperature,
      scoreMin,
      scoreMax,
      search,
    } = query

    // Construir filtro WHERE (RLS: sempre filtrar por userId)
    const where: Record<string, unknown> = { userId }

    if (status) where.status = status
    if (temperature) where.temperature = temperature
    if (city) where.city = { contains: city, mode: 'insensitive' }
    if (niche) where.category = { contains: niche, mode: 'insensitive' }

    if (scoreMin !== undefined || scoreMax !== undefined) {
      where.score = {
        ...(scoreMin !== undefined ? { gte: scoreMin } : {}),
        ...(scoreMax !== undefined ? { lte: scoreMax } : {}),
      }
    }

    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Garantir sortBy seguro (prevenção de SQL injection)
    const validSortFields: Record<string, string> = {
      score: 'score',
      createdAt: 'createdAt',
      businessName: 'businessName',
      temperature: 'temperature',
    }
    const safeSortBy = validSortFields[sortBy] ?? 'createdAt'
    const orderBy = { [safeSortBy]: sortOrder }

    const skip = Math.max(0, (page - 1) * limit)

    const [data, total] = await Promise.all([
      prisma.lead.findMany({ where, orderBy, take: limit, skip }) as Promise<Lead[]>,
      prisma.lead.count({ where }),
    ])

    return { data, total }
  }

  async findById(leadId: string, userId: string): Promise<(Lead & {
    dataProvenance: { id: string; field: string; source: string; sourceUrl: string | null; collectedAt: Date; confidence: unknown }[]
  }) | null> {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, userId },
      include: {
        dataProvenance: {
          orderBy: { collectedAt: 'desc' },
        },
      },
    }) as (Lead & { dataProvenance: { id: string; field: string; source: string; sourceUrl: string | null; collectedAt: Date; confidence: unknown }[] }) | null

    return lead
  }

  async count(userId: string) {
    const [total, byStatus, byTemperature] = await Promise.all([
      prisma.lead.count({ where: { userId } }),
      prisma.lead.groupBy({
        by: ['status'],
        where: { userId },
        _count: true,
      }),
      prisma.lead.groupBy({
        by: ['temperature'],
        where: { userId },
        _count: true,
      }),
    ])

    const statusMap = Object.fromEntries(
      byStatus.map((s) => [s.status, s._count])
    )
    const temperatureMap = Object.fromEntries(
      byTemperature.map((t) => [t.temperature, t._count])
    )

    return {
      total,
      byStatus: {
        NEW: statusMap['NEW'] ?? 0,
        CONTACTED: statusMap['CONTACTED'] ?? 0,
        NEGOTIATING: statusMap['NEGOTIATING'] ?? 0,
        CONVERTED: statusMap['CONVERTED'] ?? 0,
        DISCARDED: statusMap['DISCARDED'] ?? 0,
        DISQUALIFIED: statusMap['DISQUALIFIED'] ?? 0,
        FALSE_POSITIVE: statusMap['FALSE_POSITIVE'] ?? 0,
        ENRICHMENT_PENDING: statusMap['ENRICHMENT_PENDING'] ?? 0,
      },
      byTemperature: {
        COLD: temperatureMap[LeadTemperature.COLD] ?? 0,
        WARM: temperatureMap[LeadTemperature.WARM] ?? 0,
        HOT: temperatureMap[LeadTemperature.HOT] ?? 0,
      },
    }
  }

  async getDashboardKpis(userId: string) {
    const [
      totalLeads,
      hotLeads,
      warmLeads,
      coldLeads,
      convertedLeads,
      activeJobs,
      recentLeads,
    ] = await Promise.all([
      prisma.lead.count({ where: { userId } }),
      prisma.lead.count({ where: { userId, temperature: LeadTemperature.HOT } }),
      prisma.lead.count({ where: { userId, temperature: LeadTemperature.WARM } }),
      prisma.lead.count({ where: { userId, temperature: LeadTemperature.COLD } }),
      prisma.lead.count({ where: { userId, status: 'CONVERTED' } }),
      prisma.collectionJob.count({
        where: {
          userId,
          status: { in: [CollectionJobStatus.PENDING, CollectionJobStatus.RUNNING] },
        },
      }),
      prisma.lead.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: LEAD_SUMMARY_SELECT,
      }),
    ])

    const conversionRate = totalLeads > 0
      ? Math.round((convertedLeads / totalLeads) * 100)
      : 0

    return {
      kpis: { totalLeads, hotLeads, warmLeads, coldLeads, convertedLeads, conversionRate, activeJobs },
      recentLeads,
    }
  }

  async updateStatus(leadId: string, userId: string, data: UpdateLeadStatusInput): Promise<Lead> {
    // Verificar propriedade (IDOR prevention)
    const existing = await prisma.lead.findFirst({ where: { id: leadId, userId }, select: { id: true } })
    if (!existing) {
      const err = Object.assign(new Error('Lead não encontrado.'), { code: 'LEAD_080', httpStatus: 404 })
      throw err
    }

    return prisma.lead.update({
      where: { id: leadId },
      data: {
        status: data.status as Lead['status'],
        ...(data.status === 'CONTACTED' ? { contactedAt: new Date() } : {}),
      },
    }) as Promise<Lead>
  }

  async updateNotes(leadId: string, userId: string, data: UpdateLeadNotesInput): Promise<Lead> {
    const existing = await prisma.lead.findFirst({ where: { id: leadId, userId }, select: { id: true } })
    if (!existing) {
      const err = Object.assign(new Error('Lead não encontrado.'), { code: 'LEAD_080', httpStatus: 404 })
      throw err
    }

    return prisma.lead.update({
      where: { id: leadId },
      data: { notes: data.notes },
    }) as Promise<Lead>
  }

  async updatePitch(leadId: string, userId: string, data: UpdateLeadPitchInput): Promise<Lead> {
    const existing = await prisma.lead.findFirst({ where: { id: leadId, userId }, select: { id: true } })
    if (!existing) {
      const err = Object.assign(new Error('Lead não encontrado.'), { code: 'LEAD_080', httpStatus: 404 })
      throw err
    }

    return prisma.lead.update({
      where: { id: leadId },
      data: { pitchContent: data.pitchContent, pitchTone: data.pitchTone },
    }) as Promise<Lead>
  }

  async regeneratePitch(_leadId: string, _userId: string, _data: RegeneratePitchInput) {
    // TODO: Integrar com LLM pipeline (module-13)
    throw Object.assign(new Error('Regeneração de pitch requer módulo de inteligência (module-13).'), { code: 'PITCH_050', httpStatus: 503 })
  }

  async markFalsePositive(leadId: string, userId: string, data: MarkFalsePositiveInput): Promise<Lead> {
    const existing = await prisma.lead.findFirst({ where: { id: leadId, userId }, select: { id: true } })
    if (!existing) {
      const err = Object.assign(new Error('Lead não encontrado.'), { code: 'LEAD_080', httpStatus: 404 })
      throw err
    }

    return prisma.lead.update({
      where: { id: leadId },
      data: {
        status: 'FALSE_POSITIVE',
        falsePositiveReason: data.reason ?? null,
      },
    }) as Promise<Lead>
  }

  async exportCsv(userId: string, query: LeadListQuery): Promise<string> {
    const MAX_EXPORT = Math.min(query.limit, Limits.MAX_COLLECTION_SIZE)

    const where: Record<string, unknown> = { userId }
    if (query.status) where.status = query.status
    if (query.temperature) where.temperature = query.temperature
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' }
    if (query.niche) where.category = { contains: query.niche, mode: 'insensitive' }
    if (query.scoreMin !== undefined || query.scoreMax !== undefined) {
      where.score = {
        ...(query.scoreMin !== undefined ? { gte: query.scoreMin } : {}),
        ...(query.scoreMax !== undefined ? { lte: query.scoreMax } : {}),
      }
    }
    if (query.search) {
      where.OR = [
        { businessName: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
        { category: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { score: 'desc' },
      take: MAX_EXPORT,
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

    // Construir CSV com escape adequado
    const csvEscape = (val: unknown): string => {
      if (val === null || val === undefined) return ''
      const str = Array.isArray(val) ? val.join(';') : String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const headers = ['ID', 'Nome', 'Categoria', 'Cidade', 'Estado', 'Telefone', 'Site', 'Email', 'Score', 'Temperatura', 'Tipos de Oportunidade', 'Status', 'Criado em']
    const rows = leads.map((l) => [
      l.id,
      l.businessName,
      l.category,
      l.city,
      l.state,
      l.phone,
      l.website,
      l.email,
      l.score,
      l.temperature,
      l.opportunities,
      l.status,
      l.createdAt.toISOString().split('T')[0],
    ].map(csvEscape).join(','))

    return [headers.join(','), ...rows].join('\n')
  }
}

export const leadService = new LeadService()
