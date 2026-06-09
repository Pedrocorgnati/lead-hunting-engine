'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

interface DndSettings {
  start: string | null
  end: string | null
}

export default function NotificationPreferencesForm() {
  const [matrix, setMatrix] = useState<Matrix | null>(null)
  const [dnd, setDnd] = useState<DndSettings>({ start: null, end: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const [prefsRes, dndRes] = await Promise.all([
        fetch('/api/v1/notifications/preferences', { credentials: 'include' }),
        fetch('/api/v1/notifications/preferences/dnd', { credentials: 'include' }),
      ])
      if (!prefsRes.ok || !dndRes.ok) throw new Error()
      const prefsJson: { data: Matrix } = await prefsRes.json()
      const dndJson: { data: DndSettings } = await dndRes.json()
      setMatrix(prefsJson.data)
      setDnd(dndJson.data)
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
      const [prefsRes, dndRes] = await Promise.all([
        fetch('/api/v1/notifications/preferences', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(matrix),
        }),
        fetch('/api/v1/notifications/preferences/dnd', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: dnd.start, end: dnd.end }),
        }),
      ])
      if (!prefsRes.ok || !dndRes.ok) throw new Error()
      const prefsJson: { data: Matrix } = await prefsRes.json()
      setMatrix(prefsJson.data)
      toast.success('Preferencias salvas.')
    } catch {
      toast.error('Nao foi possivel salvar suas preferencias.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      const res = await fetch('/api/v1/notifications/test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) throw new Error()
      toast.success('Notificacao de teste enviada.')
    } catch {
      toast.error('Falha ao enviar notificacao de teste.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div data-testid="notifications-preferences-form" className="max-w-3xl mx-auto space-y-6">
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

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Nao perturbe</CardTitle>
              <CardDescription className="text-xs">
                Defina um horario em que notificacoes push e email serao silenciadas.
                A central in-app continua registrando tudo.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Das</label>
                <input
                  type="time"
                  value={dnd.start ?? ''}
                  onChange={(e) => setDnd((prev) => ({ ...prev, start: e.target.value || null }))}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">ate</label>
                <input
                  type="time"
                  value={dnd.end ?? ''}
                  onChange={(e) => setDnd((prev) => ({ ...prev, end: e.target.value || null }))}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDnd({ start: null, end: null })}
              >
                Limpar
              </Button>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              disabled={testing}
              onClick={handleTest}
              data-testid="test-notification-btn"
            >
              {testing ? 'Enviando...' : 'Testar notificacao'}
            </Button>
            <div className="flex items-center gap-2">
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
          </div>
        </form>
      )}
    </div>
  )
}
