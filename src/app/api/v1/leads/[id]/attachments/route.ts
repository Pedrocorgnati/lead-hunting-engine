import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { handleApiError, successResponse } from '@/lib/api-utils'
import { AuditService } from '@/lib/services/audit-service'
import { createClient } from '@/lib/supabase/server'
import { errorResponse, LEAD_050, LEAD_080 } from '@/constants/errors'

const MAX_SIZE = 10 * 1024 * 1024
const BUCKET = 'leads-attachments'

async function assertLeadOwnership(leadId: string, userId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { userId: true } })
  if (!lead) return { error: NextResponse.json(errorResponse(LEAD_080), { status: 404 }) }
  if (lead.userId !== userId) return { error: NextResponse.json(errorResponse(LEAD_050), { status: 403 }) }
  return { error: null }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const guard = await assertLeadOwnership(id, user.id)
    if (guard.error) return guard.error

    const items = await prisma.attachment.findMany({
      where: { leadId: id },
      orderBy: { createdAt: 'desc' },
    })
    return successResponse(items)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const guard = await assertLeadOwnership(id, user.id)
    if (guard.error) return guard.error

    const form = await request.formData()
    const file = form.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: { code: 'VAL_001', message: 'Arquivo ausente.' } }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: { code: 'VAL_003', message: 'Arquivo excede 10MB.' } },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const path = `${id}/${Date.now()}-${file.name}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (uploadErr) throw new Error(`Upload falhou: ${uploadErr.message}`)

    const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(path)

    const attachment = await prisma.attachment.create({
      data: {
        leadId: id,
        url: publicUrl.publicUrl,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        uploadedBy: user.id,
      },
    })

    await AuditService.log({
      userId: user.id,
      action: 'lead.attachment_added',
      resource: 'lead',
      resourceId: id,
      metadata: { attachmentId: attachment.id, filename: file.name, size: file.size },
    })

    return successResponse(attachment)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const guard = await assertLeadOwnership(id, user.id)
    if (guard.error) return guard.error

    const url = new URL(request.url)
    const attachmentId = url.searchParams.get('attachmentId')
    if (!attachmentId) {
      return NextResponse.json({ error: { code: 'VAL_001', message: 'attachmentId obrigatório.' } }, { status: 400 })
    }

    await prisma.attachment.deleteMany({ where: { id: attachmentId, leadId: id } })

    await AuditService.log({
      userId: user.id,
      action: 'lead.attachment_deleted',
      resource: 'lead',
      resourceId: id,
      metadata: { attachmentId },
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
