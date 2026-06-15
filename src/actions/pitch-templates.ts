'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  PitchTemplateCreateSchema,
  PitchTemplateUpdateSchema,
} from '@/lib/schemas/pitch-template'
import { handleApiError } from '@/lib/api-utils'
import { setSenderProfile } from '@/lib/outreach/sender-profile'

/** Salva o perfil do remetente que alimenta {{meu_*}} dos templates. */
export async function updateSenderProfile(formData: FormData) {
  try {
    const user = await requireAuth()
    await setSenderProfile(
      {
        name: String(formData.get('name') ?? '').trim(),
        company: String(formData.get('company') ?? '').trim(),
        whatsapp: String(formData.get('whatsapp') ?? '').trim(),
        portfolio: String(formData.get('portfolio') ?? '').trim(),
      },
      user.id,
    )
    revalidatePath('/templates/pitch')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function getPitchTemplates(query: {
  page?: number
  limit?: number
  search?: string
  tone?: string
}) {
  try {
    const user = await requireAuth()
    const page = Math.max(1, query.page ?? 1)
    const limit = Math.max(1, Math.min(100, query.limit ?? 20))
    const where: Record<string, unknown> = { userId: user.id }

    if (query.tone) where.tone = query.tone
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.pitchTemplate.findMany({
        where,
        orderBy: [{ isFavorite: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
        skip,
      }),
      prisma.pitchTemplate.count({ where }),
    ])

    return { data, total, pages: Math.ceil(total / limit) }
  } catch (error) {
    throw new Error(handleApiError(error).toString())
  }
}

export async function getPitchTemplate(id: string) {
  try {
    const user = await requireAuth()
    const template = await prisma.pitchTemplate.findFirst({
      where: { id, userId: user.id },
    })
    return template
  } catch {
    return null
  }
}

export async function createPitchTemplate(formData: FormData) {
  try {
    const user = await requireAuth()
    const raw = Object.fromEntries(formData.entries())
    const data = PitchTemplateCreateSchema.parse({
      name: raw.name,
      content: raw.content,
      tone: raw.tone,
      channel: raw.channel || undefined,
      subject: raw.subject || undefined,
      isFavorite: raw.isFavorite === 'true',
    })

    await prisma.pitchTemplate.create({
      data: { ...data, userId: user.id },
    })

    revalidatePath('/templates/pitch')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function updatePitchTemplate(id: string, formData: FormData) {
  try {
    const user = await requireAuth()
    const existing = await prisma.pitchTemplate.findFirst({
      where: { id, userId: user.id },
      select: { id: true, name: true, content: true, tone: true },
    })
    if (!existing) return { success: false, error: 'Template não encontrado.' }

    const raw = Object.fromEntries(formData.entries())
    const data = PitchTemplateUpdateSchema.parse({
      name: raw.name || undefined,
      content: raw.content || undefined,
      tone: raw.tone || undefined,
      channel: raw.channel || undefined,
      subject: raw.subject || undefined,
      isFavorite: raw.isFavorite === 'true' ? true : raw.isFavorite === 'false' ? false : undefined,
    })

    await prisma.$transaction(async (tx) => {
      await tx.pitchTemplateVersion.create({
        data: {
          pitchTemplateId: id,
          name: existing.name,
          content: existing.content,
          tone: existing.tone,
        },
      })

      if (data.isFavorite === true) {
        await tx.pitchTemplate.updateMany({
          where: { userId: user.id, isFavorite: true, NOT: { id } },
          data: { isFavorite: false },
        })
      }

      await tx.pitchTemplate.update({ where: { id }, data })
    })

    revalidatePath('/templates/pitch')
    revalidatePath(`/templates/pitch/${id}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function deletePitchTemplate(id: string) {
  try {
    const user = await requireAuth()
    const existing = await prisma.pitchTemplate.findFirst({
      where: { id, userId: user.id },
      select: { id: true, isFavorite: true },
    })
    if (!existing) return { success: false, error: 'Template não encontrado.' }
    if (existing.isFavorite) {
      return { success: false, error: 'Não é possível remover o template favorito.' }
    }

    await prisma.pitchTemplate.delete({ where: { id } })
    revalidatePath('/templates/pitch')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function restorePitchTemplateVersion(id: string, versionId: string) {
  try {
    const user = await requireAuth()
    const template = await prisma.pitchTemplate.findFirst({
      where: { id, userId: user.id },
      select: { id: true, name: true, content: true, tone: true },
    })
    if (!template) return { success: false, error: 'Template não encontrado.' }

    const version = await prisma.pitchTemplateVersion.findFirst({
      where: { id: versionId, pitchTemplateId: id },
    })
    if (!version) return { success: false, error: 'Versão do template não encontrada.' }

    await prisma.$transaction(async (tx) => {
      await tx.pitchTemplateVersion.create({
        data: {
          pitchTemplateId: id,
          name: template.name,
          content: template.content,
          tone: template.tone,
        },
      })

      await tx.pitchTemplate.update({
        where: { id },
        data: {
          name: version.name,
          content: version.content,
          tone: version.tone,
        },
      })
    })

    revalidatePath('/templates/pitch')
    revalidatePath(`/templates/pitch/${id}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function duplicatePitchTemplate(id: string) {
  try {
    const user = await requireAuth()
    const existing = await prisma.pitchTemplate.findFirst({
      where: { id, userId: user.id },
    })
    if (!existing) return { success: false, error: 'Template não encontrado.' }

    await prisma.pitchTemplate.create({
      data: {
        userId: user.id,
        name: `${existing.name} (cópia)`,
        content: existing.content,
        tone: existing.tone,
        isFavorite: false,
      },
    })

    revalidatePath('/templates/pitch')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function getPitchTemplateVersions(id: string, page = 1, limit = 20) {
  try {
    const user = await requireAuth()
    const template = await prisma.pitchTemplate.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })
    if (!template) return { data: [], total: 0, pages: 0 }

    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      prisma.pitchTemplateVersion.findMany({
        where: { pitchTemplateId: id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.pitchTemplateVersion.count({ where: { pitchTemplateId: id } }),
    ])

    return { data, total, pages: Math.ceil(total / limit) }
  } catch {
    return { data: [], total: 0, pages: 0 }
  }
}
