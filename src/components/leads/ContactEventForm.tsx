'use client'

/**
 * R-03 intake-review (CL-283 + TASK-18/ST005): form estruturado de registro
 * de contato. Canal + Resultado obrigatorios, note opcional.
 * Substitui o fluxo livre-texto em Lead.notes para novos registros.
 *
 * O legado `NotesEditor` continua para editar a nota do lead (campo unico);
 * este form cria entradas em `ContactEvent` (append-only timeline).
 */
import { useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, Loader2, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'

const CHANNELS = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'TELEFONE', label: 'Telefone' },
  { value: 'PRESENCIAL', label: 'Presencial' },
  { value: 'OUTRO', label: 'Outro' },
] as const

const OUTCOMES = [
  { value: 'NO_ANSWER', label: 'Sem resposta' },
  { value: 'ANSWERED', label: 'Atendido' },
  { value: 'INTERESTED', label: 'Interessado' },
  { value: 'REJECTED', label: 'Rejeitou' },
  { value: 'SCHEDULED', label: 'Agendado' },
] as const

type Channel = (typeof CHANNELS)[number]['value']
type Outcome = (typeof OUTCOMES)[number]['value']

interface ContactEvent {
  id: string
  channel: Channel
  outcome: Outcome
  note: string | null
  createdAt: string
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ContactEventForm({ leadId }: { leadId: string }) {
  const toast = useToast()
  const [channel, setChannel] = useState<Channel>('WHATSAPP')
  const [outcome, setOutcome] = useState<Outcome>('NO_ANSWER')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [events, setEvents] = useState<ContactEvent[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = async () => {
    try {
      const r = await fetch(`/api/v1/leads/${encodeURIComponent(leadId)}/contact-events`, {
        cache: 'no-store',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { data: { events: ContactEvent[] } }
      setEvents(json.data.events)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar histórico')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const r = await fetch(`/api/v1/leads/${encodeURIComponent(leadId)}/contact-events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel,
          outcome,
          note: note.trim() ? note.trim() : undefined,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setNote('')
      toast.success('Contato registrado.')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar contato')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section
      data-testid="contact-event-form"
      aria-labelledby="contact-events-title"
      className="rounded-lg border border-border bg-card p-4"
    >
      <header className="flex items-center gap-2">
        <MessageSquarePlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="contact-events-title" className="text-sm font-semibold">
          Registrar contato
        </h2>
      </header>

      <form onSubmit={submit} className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium">
            Canal
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              data-testid="contact-event-channel"
              disabled={submitting}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium">
            Resultado
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as Outcome)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              data-testid="contact-event-outcome"
              disabled={submitting}
            >
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs font-medium">
          Observação (opcional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Ex: ligar de volta na segunda"
            className="mt-1 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            data-testid="contact-event-note"
            disabled={submitting}
          />
        </label>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={submitting} data-testid="contact-event-submit">
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" aria-hidden="true" />
            ) : null}
            Registrar
          </Button>
        </div>
      </form>

      <div className="mt-4 border-t border-border pt-3">
        <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
          Histórico de contatos
        </h3>
        {events === null && !loadError ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : loadError ? (
          <p className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            {loadError}
          </p>
        ) : events && events.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum contato registrado ainda.</p>
        ) : (
          <ul className="space-y-2" data-testid="contact-events-list">
            {events?.slice(0, 10).map((e) => {
              const cLabel = CHANNELS.find((c) => c.value === e.channel)?.label ?? e.channel
              const oLabel = OUTCOMES.find((o) => o.value === e.outcome)?.label ?? e.outcome
              return (
                <li key={e.id} className="text-xs">
                  <span className="font-medium">{cLabel}</span>
                  <span className="text-muted-foreground"> · {oLabel} · </span>
                  <time dateTime={e.createdAt} className="text-muted-foreground">
                    {fmtDate(e.createdAt)}
                  </time>
                  {e.note ? <p className="mt-0.5 text-foreground">{e.note}</p> : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
