'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { createJob } from '@/actions/jobs'
import { Routes } from '@/lib/constants'
import { ProviderHealthIndicator } from '@/components/shared/provider-health-indicator'

const DRAFT_KEY = 'coleta-nova-draft'

interface FormData {
  name: string
  query: string
  location: string
  radiusMeters: number
  maxResults: number
}

function validateForm(data: unknown): { success: true; data: FormData } | { success: false; errors: Record<string, string> } {
  const obj = data as Record<string, unknown>
  const errors: Record<string, string> = {}
  if (!obj.name || String(obj.name).trim().length < 3) errors.name = 'Nome deve ter pelo menos 3 caracteres'
  if (!obj.query || String(obj.query).trim().length < 2) errors.query = 'Nicho deve ter pelo menos 2 caracteres'
  if (!obj.location || String(obj.location).trim().length < 2) errors.location = 'Informe cidade e estado (ex: Sao Paulo, SP)'
  const radius = Number(obj.radiusMeters)
  if (Number.isNaN(radius) || radius < 500) errors.radiusMeters = 'Raio minimo: 500m'
  if (Number.isNaN(radius) || radius > 50000) errors.radiusMeters = 'Raio maximo: 50km'
  const maxRes = Number(obj.maxResults)
  if (Number.isNaN(maxRes) || maxRes < 10) errors.maxResults = 'Minimo 10 resultados'
  if (Number.isNaN(maxRes) || maxRes > 500) errors.maxResults = 'Maximo 500 resultados'
  if (Object.keys(errors).length > 0) return { success: false, errors }
  return { success: true, data: { name: String(obj.name).trim(), query: String(obj.query).trim(), location: String(obj.location).trim(), radiusMeters: radius, maxResults: maxRes } }
}

function loadDraft(): Partial<FormData> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Partial<FormData>) : null
  } catch {
    return null
  }
}

function saveDraft(data: Partial<FormData>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
  } catch {
    // localStorage indisponivel (modo privado restrito) - silencioso
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // noop
  }
}

export default function NovaColetaPage() {
  const router = useRouter()
  const feedbackId = useId()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormData>({
    defaultValues: { name: '', query: '', location: '', radiusMeters: 5000, maxResults: 100 },
  })

  // Restaurar rascunho salvo ao montar
  useEffect(() => {
    const draft = loadDraft()
    if (draft && Object.values(draft).some(Boolean)) {
      reset({ radiusMeters: 5000, maxResults: 100, ...draft })
      setDraftRestored(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-salvar rascunho a cada alteracao
  useEffect(() => {
    const sub = watch((values) => {
      const hasContent = Object.values(values).some((v) => v !== '' && v !== undefined)
      if (hasContent) saveDraft(values as Partial<FormData>)
    })
    return () => sub.unsubscribe()
  }, [watch])

  function handleDiscard() {
    clearDraft()
    reset({ name: '', query: '', location: '', radiusMeters: 5000, maxResults: 100 })
    setDraftRestored(false)
    toast.info('Rascunho descartado.')
  }

  async function onSubmit(raw: FormData) {
    setFeedback(null)
    const validation = validateForm(raw)
    if (!validation.success) {
      Object.entries(validation.errors).forEach(([field, message]) => {
        // @ts-expect-error dynamic setError
        errors[field] = { type: 'manual', message }
      })
      toast.error('Corrija os erros no formulario.')
      return
    }
    const data = validation.data
    try {
      const result = await createJob(data)
      clearDraft()
      toast.success('Coleta iniciada com sucesso!')
      router.push(Routes.COLLECTION_DETAIL(result.id))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar coleta. Tente novamente.'
      setFeedback(msg)
      toast.error(msg)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <Link
        href={Routes.COLETAS}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar para Coletas
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Nova coleta</h1>
          <p className="text-sm text-muted-foreground">
            Configure os parametros da sua busca de leads.
          </p>
        </div>
        <ProviderHealthIndicator />

        {(draftRestored || isDirty) && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Save className="h-3 w-3" aria-hidden="true" />
              Rascunho salvo
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={handleDiscard}
              disabled={isSubmitting}
            >
              Descartar
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Parametros da coleta</CardTitle>
          <CardDescription>
            Defina o nicho, regiao e limites para sua busca.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            aria-label="Formulario de nova coleta"
            noValidate
          >
            <div className="space-y-1">
              <Label htmlFor="name">Nome da coleta</Label>
              <Input
                id="name"
                placeholder="Ex: Padarias - Sao Paulo"
                disabled={isSubmitting}
                aria-describedby={errors.name ? 'name-error' : undefined}
                {...register('name')}
              />
              {errors.name && (
                <p id="name-error" role="alert" className="text-xs text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="query">Nicho / Segmento</Label>
              <Input
                id="query"
                placeholder="Ex: Padarias, Restaurantes, Clinicas..."
                disabled={isSubmitting}
                aria-describedby={errors.query ? 'query-error' : undefined}
                {...register('query')}
              />
              {errors.query && (
                <p id="query-error" role="alert" className="text-xs text-destructive">
                  {errors.query.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="location">Cidade e estado</Label>
              <Input
                id="location"
                placeholder="Ex: Sao Paulo, SP"
                disabled={isSubmitting}
                aria-describedby={errors.location ? 'location-error' : undefined}
                {...register('location')}
              />
              {errors.location && (
                <p id="location-error" role="alert" className="text-xs text-destructive">
                  {errors.location.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="radiusMeters">Raio de busca (metros)</Label>
                <Input
                  id="radiusMeters"
                  type="number"
                  min={500}
                  max={50000}
                  disabled={isSubmitting}
                  aria-describedby={errors.radiusMeters ? 'radius-error' : undefined}
                  {...register('radiusMeters')}
                />
                {errors.radiusMeters && (
                  <p id="radius-error" role="alert" className="text-xs text-destructive">
                    {errors.radiusMeters.message}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="maxResults">Maximo de resultados</Label>
                <Input
                  id="maxResults"
                  type="number"
                  min={10}
                  max={500}
                  disabled={isSubmitting}
                  aria-describedby={errors.maxResults ? 'max-error' : undefined}
                  {...register('maxResults')}
                />
                {errors.maxResults && (
                  <p id="max-error" role="alert" className="text-xs text-destructive">
                    {errors.maxResults.message}
                  </p>
                )}
              </div>
            </div>

            <div
              id={feedbackId}
              role="status"
              aria-live="polite"
              className="min-h-[1rem] text-xs"
            >
              {feedback && (
                <span className="text-destructive">{feedback}</span>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => router.push(Routes.COLETAS)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                ) : null}
                Iniciar coleta
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
