import { createClient } from '@/lib/supabase/server'

const TTL_SECONDS = 30

export interface UndoSnapshot {
  action: 'delete-tag' | 'delete-note'
  leadId: string
  resourceId: string
  snapshot: Record<string, unknown>
}

export async function saveUndoSnapshot(
  leadId: string,
  snapshot: UndoSnapshot,
): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString()

  const supabase = await createClient()
  await supabase.from('undo_tokens').insert({
    token,
    lead_id: leadId,
    payload: snapshot,
    expires_at: expiresAt,
  })

  return { token, expiresAt }
}

export async function consumeUndoSnapshot(
  leadId: string,
  token: string,
): Promise<UndoSnapshot | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('undo_tokens')
    .select('*')
    .eq('token', token)
    .eq('lead_id', leadId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !data) return null

  await supabase.from('undo_tokens').delete().eq('token', token)

  return data.payload as UndoSnapshot
}
