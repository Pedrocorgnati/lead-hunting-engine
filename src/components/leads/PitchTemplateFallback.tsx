'use client'

import { useEffect, useState } from 'react'
import { FileText, Loader2, Plus, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/utils/api-client'
import { API_ROUTES } from '@/lib/constants/routes'

interface PitchTemplate {
  id: string
  name: string
  content: string
  tone: string
  isFavorite: boolean
}

interface PaginatedResponse<T> {
  data: T[]
  meta: { total: number }
}

interface Props {
  variant: 'unavailable' | 'hallucinated'
  onApply: (template: PitchTemplate) => void | Promise<void>
}

const VARIANT_COPY: Record<Props['variant'], { title: string; description: string }> = {
  unavailable: {
    title: 'LLM indisponível',
    description:
      'Não conseguimos gerar o pitch agora. Escolha um dos seus templates manuais para este lead.',
  },
  hallucinated: {
    title: 'Pitch inválido detectado',
    description:
      'A IA gerou um conteúdo que não passou na verificação. Aplique um template manual para seguir com segurança.',
  },
}

export function PitchTemplateFallback({ variant, onApply }: Props) {
  const [templates, setTemplates] = useState<PitchTemplate[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const res = await apiClient.get<PaginatedResponse<PitchTemplate>>(
        `${API_ROUTES.PITCH_TEMPLATES}?limit=20`
      )
      if (cancelled) return
      setLoading(false)
      if (res.error) {
        setError(res.error.message ?? 'Não foi possível carregar templates.')
        return
      }
      setTemplates(res.data?.data ?? [])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const copy = VARIANT_COPY[variant]

  async function handleApply(template: PitchTemplate) {
    setApplyingId(template.id)
    try {
      await onApply(template)
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <div
      className="rounded-lg border border-dashed p-4 space-y-3"
      data-testid="pitch-template-fallback"
      role="region"
      aria-label={copy.title}
    >
      <div className="flex items-start gap-2">
        <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">{copy.title}</p>
          <p className="text-xs text-muted-foreground">{copy.description}</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-busy="true">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Carregando templates…
        </div>
      )}

      {!loading && error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && templates && templates.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Você ainda não tem templates manuais salvos.
          </p>
          <a
            href="/perfil?tab=pitch-templates"
            className="inline-flex items-center justify-center gap-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
            data-testid="pitch-template-create-cta"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Criar template
          </a>
        </div>
      )}

      {!loading && !error && templates && templates.length > 0 && (
        <ul className="space-y-2" data-testid="pitch-template-list">
          {templates.map((t) => (
            <li
              key={t.id}
              className="rounded-md border bg-background p-3 space-y-2"
              data-testid="pitch-template-item"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium flex items-center gap-1">
                  {t.isFavorite && (
                    <Star
                      className="h-3 w-3 fill-yellow-400 text-yellow-400"
                      aria-label="Favorito"
                    />
                  )}
                  {t.name}
                </p>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t.tone}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                {t.content}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={applyingId !== null}
                onClick={() => handleApply(t)}
                aria-label={`Aplicar template ${t.name}`}
              >
                {applyingId === t.id ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Aplicando…
                  </>
                ) : (
                  'Aplicar'
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export type { PitchTemplate }
