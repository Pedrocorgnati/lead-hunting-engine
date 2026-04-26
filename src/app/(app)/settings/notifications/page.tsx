'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner'
import {
  NOTIFICATION_EVENTS,
  EVENT_LABELS,
  type NotificationEventKey,
} from '@/lib/notifications/copy'

type Channel = 'push' | 'email' | 'in-app'
const CHANNELS: Channel[] = ['push', 'email', 'in-app']
const CHANNEL_LABELS: Record<Channel, string> = {
  push: 'Push',
  email: 'Email',
  'in-app': 'Central (in-app)',
}

type Matrix = Record<NotificationEventKey, Channel[]>

export default function NotificationsSettingsPage() {
  const [matrix, setMatrix] = useState<Matrix | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/v1/notifications/preferences', { credentials: 'include' })
      if (!res.ok) throw new Error()
      const json: { data: Matrix } = await res.json()
      setMatrix(json.data)
    } catch {
      setError(true)
      toast.error('Nao foi possivel carregar suas preferencias.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function toggle(event: NotificationEventKey, channel: Channel) {
    setMatrix((prev) => {
      if (!prev) return prev
      const current = prev[event] ?? []
      const next = current.includes(channel)
        ? current.filter((c) => c !== channel)
        : [...current, channel]
      return { ...prev, [event]: next }
    })
  }

  async function save() {
    if (!matrix) return
    setSaving(true)
    try {
      const res = await fetch('/api/v1/notifications/preferences', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matrix),
      })
      if (!res.ok) throw new Error()
      const json: { data: Matrix } = await res.json()
      setMatrix(json.data)
      toast.success('Preferencias salvas.')
    } catch {
      toast.error('Nao foi possivel salvar suas preferencias.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="notifications-settings-page" className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Preferencias de notificacao</h1>
        <p className="text-sm text-muted-foreground">
          Escolha por qual canal voce quer ser avisado de cada evento. A central (in-app) sempre guarda
          um historico; se voce desativar push e email, criamos a entrada in-app mesmo assim para voce
          nao perder nada.
        </p>
      </div>

      <NotificationPermissionBanner />

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error || !matrix ? (
        <div className="rounded-lg border bg-card p-6 text-center space-y-4">
          <p className="text-sm text-muted-foreground">Nao foi possivel carregar suas preferencias.</p>
          <Button variant="outline" onClick={load}>Tentar novamente</Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); save() }}
          className="space-y-4"
          data-testid="notifications-preferences-form"
        >
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Evento</th>
                  {CHANNELS.map((c) => (
                    <th key={c} className="px-4 py-2 text-center font-medium">{CHANNEL_LABELS[c]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {NOTIFICATION_EVENTS.map((event) => (
                  <tr key={event} data-testid={`pref-row-${event}`}>
                    <td className="px-4 py-3 font-medium text-foreground">{EVENT_LABELS[event]}</td>
                    {CHANNELS.map((channel) => {
                      const checked = (matrix[event] ?? []).includes(channel)
                      return (
                        <td key={channel} className="px-4 py-3 text-center">
                          <label className="inline-flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              data-testid={`pref-${event}-${channel}`}
                              checked={checked}
                              onChange={() => toggle(event, channel)}
                              aria-label={`${EVENT_LABELS[event]} via ${CHANNEL_LABELS[channel]}`}
                              className="h-4 w-4 rounded border-input"
                            />
                          </label>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={load}
            >
              Descartar
            </Button>
            <Button
              type="submit"
              data-testid="notifications-preferences-save"
              disabled={saving}
            >
              {saving ? 'Salvando...' : 'Salvar preferencias'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
