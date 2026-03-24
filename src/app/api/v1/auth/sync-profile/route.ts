import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AuditService } from '@/lib/services/audit-service'

// Supabase Auth webhook — syncs auth.users → public.user_profiles
// Called on INSERT (new user signup or invite acceptance)
// Validates SUPABASE_WEBHOOK_SECRET via Authorization: Bearer header

interface SupabaseAuthRecord {
  id: string
  email: string
  raw_user_meta_data?: {
    name?: string
    full_name?: string
    avatar_url?: string
  }
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: SupabaseAuthRecord | null
  old_record: SupabaseAuthRecord | null
}

function validateWebhookSecret(request: NextRequest): boolean {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET
  if (!secret) {
    // Webhook secret not configured — reject all requests
    return false
  }
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  return token === secret
}

export async function POST(request: NextRequest) {
  if (!validateWebhookSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = (await request.json()) as WebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only process INSERT events on auth.users
  if (payload.type !== 'INSERT' || payload.schema !== 'auth' || payload.table !== 'users') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const record = payload.record
  if (!record?.id || !record?.email) {
    return NextResponse.json({ error: 'Missing user id or email' }, { status: 400 })
  }

  try {
    // Check if this is the first user ever (→ ADMIN)
    const existingCount = await prisma.userProfile.count()
    const isFirstUser = existingCount === 0

    const name =
      record.raw_user_meta_data?.full_name ??
      record.raw_user_meta_data?.name ??
      null

    const avatarUrl = record.raw_user_meta_data?.avatar_url ?? null

    // Upsert UserProfile (idempotent — safe for retries)
    const profile = await prisma.userProfile.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        email: record.email,
        name,
        avatarUrl,
        role: isFirstUser ? 'ADMIN' : 'OPERATOR',
      },
      update: {
        email: record.email,
        name: name ?? undefined,
        avatarUrl: avatarUrl ?? undefined,
      },
    })

    await AuditService.log({
      userId: profile.id,
      action: isFirstUser ? 'AUTH_SIGNUP_ADMIN' : 'AUTH_SIGNUP',
      resource: 'user_profile',
      resourceId: profile.id,
      metadata: { isFirstUser },
    })

    return NextResponse.json({ ok: true, userId: profile.id, role: profile.role })
  } catch (error) {
    console.error('[sync-profile] Erro ao sincronizar perfil:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
