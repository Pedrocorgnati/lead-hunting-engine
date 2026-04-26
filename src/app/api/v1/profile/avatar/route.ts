import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_SIZE = 2 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const EXT_FOR_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const BUCKET = 'avatars'

function objectPathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.substring(idx + marker.length)
}

/**
 * POST /api/v1/profile/avatar
 *
 * Multipart form: `file` (image/png|image/jpeg|image/webp, <=2MB).
 * Faz upload para Supabase Storage bucket `avatars`, atualiza
 * UserProfile.avatarUrl com URL publica e deleta o arquivo anterior
 * (quando pertencer ao proprio bucket).
 *
 * Origem: TASK-14 intake-review / CL-044.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: 'VAL_001', message: 'Arquivo ausente.' } },
        { status: 400 }
      )
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        {
          error: {
            code: 'VAL_002',
            message: 'Formato nao suportado. Use PNG, JPG ou WebP.',
          },
        },
        { status: 422 }
      )
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          error: {
            code: 'VAL_003',
            message: 'Arquivo excede o limite de 2MB.',
          },
        },
        { status: 422 }
      )
    }

    const supabase = createAdminClient()
    const ext = EXT_FOR_MIME[file.type] ?? 'bin'
    const path = `${user.id}/${randomUUID()}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      })
    if (uploadError) {
      return NextResponse.json(
        { error: { code: 'SYS_002', message: 'Falha ao salvar imagem.' } },
        { status: 503 }
      )
    }

    const { data: publicData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path)
    const publicUrl = publicData.publicUrl

    const previous = await prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    })

    await prisma.userProfile.update({
      where: { id: user.id },
      data: { avatarUrl: publicUrl },
    })

    // Cleanup do arquivo anterior se pertencia ao mesmo bucket.
    if (previous?.avatarUrl) {
      const oldPath = objectPathFromPublicUrl(previous.avatarUrl)
      if (oldPath && oldPath !== path) {
        await supabase.storage
          .from(BUCKET)
          .remove([oldPath])
          .catch(() => undefined)
      }
    }

    return successResponse({ avatarUrl: publicUrl })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/v1/profile/avatar
 *
 * Remove o avatar do usuario — apaga o arquivo no Supabase Storage
 * (quando pertencer ao bucket `avatars`) e limpa UserProfile.avatarUrl.
 */
export async function DELETE() {
  try {
    const user = await requireAuth()

    const profile = await prisma.userProfile.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    })

    if (profile?.avatarUrl) {
      const path = objectPathFromPublicUrl(profile.avatarUrl)
      if (path) {
        const supabase = createAdminClient()
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined)
      }
    }

    await prisma.userProfile.update({
      where: { id: user.id },
      data: { avatarUrl: null },
    })

    return successResponse({ avatarUrl: null })
  } catch (error) {
    return handleApiError(error)
  }
}
