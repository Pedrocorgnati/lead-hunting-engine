'use client'
import { useState } from 'react'
import { Copy, Check, RefreshCw, Loader2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/use-toast'
import { apiClient } from '@/lib/utils/api-client'
import { TONE_OPTIONS, TONE_DESCRIPTIONS, type ToneOption } from '@/lib/pitch/tone-config'
import { cn } from '@/lib/utils/cn'

interface PitchData {
  content: string
  tone: string
  provider?: string
}

interface Props {
  leadId: string
  initialPitch?: PitchData
}

export function PitchCard({ leadId, initialPitch }: Props) {
  const toast = useToast()
  const [pitch, setPitch] = useState<PitchData | null>(initialPitch ?? null)
  const [tone, setTone] = useState<ToneOption>('formal')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)

    const res = await apiClient.post<PitchData & { cached?: boolean }>(
      `/api/v1/leads/${leadId}/pitch`,
      { tone }
    )
    setGenerating(false)

    if (res.error) {
      const msg =
        (res.error as { message?: string }).message ??
        'Erro ao gerar pitch. Verifique se as credenciais LLM estão configuradas.'
      setError(msg)
      toast.error(msg)
      return
    }

    if (res.data) {
      setPitch(res.data)
      if (res.data.cached) {
        toast.info('Pitch carregado do cache (gerado nas últimas 24h).')
      } else {
        toast.success('Pitch gerado com sucesso!')
      }
    }
  }

  async function handleCopy() {
    if (!pitch) return
    await navigator.clipboard.writeText(pitch.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border p-4 space-y-4" data-testid="pitch-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="font-semibold text-sm">Pitch personalizado</h3>
        </div>
        {pitch?.provider && (
          <span
            className="text-xs text-muted-foreground"
            aria-label={`Gerado via ${pitch.provider}`}
          >
            via {pitch.provider}
          </span>
        )}
      </div>

      {/* Tom selector */}
      <div className="flex gap-2 flex-wrap" role="group" aria-label="Selecionar tom do pitch">
        {TONE_OPTIONS.map((t) => (
          <button
            key={t}
            onClick={() => setTone(t)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
              tone === t
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-accent border-muted-foreground/20'
            )}
            aria-pressed={tone === t}
            title={TONE_DESCRIPTIONS[t]}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Estado: gerando */}
      {generating && (
        <div
          className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Gerando pitch com IA...
        </div>
      )}

      {/* Estado: erro */}
      {!generating && error && (
        <div
          className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={handleGenerate}>
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Estado: pitch gerado */}
      {!generating && !error && pitch && (
        <div className="space-y-2">
          <div
            className="rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap"
            data-testid="pitch-content"
            aria-label="Conteúdo do pitch gerado"
          >
            {pitch.content}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              aria-label={copied ? 'Copiado!' : 'Copiar pitch'}
            >
              {copied ? (
                <Check className="h-4 w-4 text-success" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? 'Copiado!' : 'Copiar'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
              aria-label="Regenerar pitch"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Regenerar
            </Button>
          </div>
        </div>
      )}

      {/* Estado: empty */}
      {!generating && !error && !pitch && (
        <>
          <div
            className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm"
            data-testid="pitch-empty-state"
            aria-label="Nenhum pitch gerado ainda"
          >
            Nenhum pitch gerado ainda.
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full"
            data-testid="pitch-generate-btn"
          >
            Gerar pitch
          </Button>
        </>
      )}
    </div>
  )
}
