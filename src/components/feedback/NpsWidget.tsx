'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'

/**
 * NPS Widget — M14-G-006
 *
 * Modal acessivel (WCAG 2.1 AA): role="dialog", aria-modal, foco gerenciado,
 * Escape fecha, fundo nao-clicavel quando aberto. Usa fetch direto (zero dep
 * adicional) para enxutidao — react-hook-form aqui seria overkill.
 *
 * Trigger condicional: chama GET /api/v1/feedback/nps no mount; renderiza null
 * se `eligible: false`. SE eligible: monta o trigger flutuante; o modal abre
 * apos clique. Permite "fechar agora" sem submit (a elegibilidade volta apos
 * cooldown configurado em SystemConfig.nps.response_cooldown_days).
 */

const SCORES: number[] = Array.from({ length: 11 }, (_, i) => i)

type Phase = 'closed' | 'asking' | 'submitting' | 'thanks'

interface Eligibility {
  eligible: boolean
  reason: string
  cooldownEndsAt?: string
}

export function NpsWidget() {
  const [phase, setPhase] = useState<Phase>('closed')
  const [eligibility, setEligibility] = useState<Eligibility | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const headingId = useId()

  useEffect(() => {
    let cancelled = false
    fetch('/api/v1/feedback/nps')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Eligibility | null) => {
        if (!cancelled) setEligibility(data)
      })
      .catch(() => {
        if (!cancelled) setEligibility({ eligible: false, reason: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Escape fecha o modal e foca o trigger button novamente.
  useEffect(() => {
    if (phase !== 'asking') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPhase('closed')
    }
    document.addEventListener('keydown', handler)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [phase])

  if (!eligibility?.eligible) return null

  if (phase === 'closed') {
    return (
      <button
        type="button"
        className="fixed bottom-6 right-6 z-40 rounded-full bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        onClick={() => setPhase('asking')}
        aria-label="Avaliar produto (NPS)"
      >
        Avaliar
      </button>
    )
  }

  if (phase === 'thanks') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-6 right-6 z-40 rounded-md bg-green-600 px-4 py-3 text-sm text-white shadow-lg"
      >
        Obrigado pelo feedback!
      </div>
    )
  }

  async function submit() {
    if (score === null) {
      setError('Selecione uma nota antes de enviar.')
      return
    }
    setError(null)
    setPhase('submitting')

    try {
      const res = await fetch('/api/v1/feedback/nps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, comment: comment.trim() || undefined }),
      })

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}))
        throw new Error(errorBody?.error?.message ?? `Erro ${res.status}`)
      }

      toast.success('Obrigado pelo feedback!')
      setPhase('thanks')
      setTimeout(() => setPhase('closed'), 3000)
    } catch (e) {
      setError((e as Error).message ?? 'Falha ao enviar.')
      setPhase('asking')
    }
  }

  const isSubmitting = phase === 'submitting'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      tabIndex={-1}
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 id={headingId} className="text-lg font-semibold text-gray-900">
            Como voce avalia o Lead Hunting Engine?
          </h2>
          <button
            type="button"
            onClick={() => setPhase('closed')}
            aria-label="Fechar"
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm text-gray-600">
          Em uma escala de 0 (improvavel) a 10 (muito provavel), quanto voce
          recomendaria nosso produto a um colega?
        </p>

        <fieldset className="mt-4">
          <legend className="sr-only">Escolha uma nota de 0 a 10</legend>
          <div role="radiogroup" aria-label="Nota NPS" className="grid grid-cols-11 gap-1">
            {SCORES.map((n) => {
              const selected = score === n
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setScore(n)}
                  className={`rounded border py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    selected
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              )
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>Improvavel</span>
            <span>Muito provavel</span>
          </div>
        </fieldset>

        <label htmlFor="nps-comment" className="mt-4 block text-sm font-medium text-gray-700">
          Comentario (opcional)
        </label>
        <textarea
          id="nps-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
          rows={3}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="O que motivou sua nota?"
        />
        <div className="mt-1 text-right text-xs text-gray-400">{comment.length}/2000</div>

        {error && (
          <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setPhase('closed')}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            disabled={isSubmitting}
          >
            Agora nao
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isSubmitting || score === null}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
