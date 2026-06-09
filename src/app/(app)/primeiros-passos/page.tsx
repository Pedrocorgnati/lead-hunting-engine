'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Circle, ExternalLink, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Routes } from '@/lib/constants'

interface ChecklistItem {
  id: string
  label: string
  description: string
  href: string
  required: boolean
  completed: boolean
  /** Quando true, o destino do item nao esta disponivel (ex.: bloqueado pelo plano). */
  blocked?: boolean
  /** Mensagem exibida no tooltip do item bloqueado (pt-BR). */
  blockedReason?: string
}

interface ChecklistResponse {
  data?: {
    items: ChecklistItem[]
    progress: { completed: number; total: number }
  }
  error?: { code: string; message: string }
}

export default function PrimeirosPassosPage() {
  const router = useRouter()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/onboarding/checklist')
      const json = (await res.json().catch(() => ({}))) as ChecklistResponse
      if (!res.ok) {
        setError(json.error?.message ?? 'Erro ao carregar checklist.')
        return
      }
      setItems(json.data?.items ?? [])
    } catch {
      setError('Erro de rede ao carregar checklist.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Progresso derivado dos itens (fonte unica de verdade, sem drift).
  const progress = useMemo(
    () => ({ completed: items.filter((i) => i.completed).length, total: items.length }),
    [items],
  )

  // Aplica a transicao no servidor + estado local. Reutilizado pelo undo.
  const applyToggle = useCallback(async (itemId: string, target: boolean): Promise<boolean> => {
    setToggling(itemId)
    try {
      const res = await fetch(`/api/v1/onboarding/checklist/${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: target }),
      })
      if (!res.ok) {
        toast.error('Erro ao atualizar item.')
        return false
      }
      setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, completed: target } : it)))
      return true
    } catch {
      toast.error('Erro de rede ao atualizar item.')
      return false
    } finally {
      setToggling(null)
    }
  }, [])

  // Acao do usuario: marca/desmarca e oferece undo por item (toast 5s com Desfazer).
  async function toggleItem(itemId: string, current: boolean) {
    const ok = await applyToggle(itemId, !current)
    if (!ok) return
    toast.success(current ? 'Item desmarcado.' : 'Item concluido!', {
      duration: 5000,
      action: {
        label: 'Desfazer',
        onClick: () => { void applyToggle(itemId, current) },
      },
    })
  }

  // "Voltar ao tour": vai para /onboarding/tour; se a rota nao existir (404), cai em /dashboard.
  async function voltarAoTour() {
    try {
      const res = await fetch('/onboarding/tour', { method: 'HEAD' })
      router.push(res.ok ? '/onboarding/tour' : Routes.DASHBOARD)
    } catch {
      router.push(Routes.DASHBOARD)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12" aria-label="Carregando primeiros passos...">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" aria-live="assertive" className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {error}
        <Button variant="ghost" size="sm" onClick={() => void load()} className="ml-2">
          Tentar novamente
        </Button>
      </div>
    )
  }

  const allDone = progress.total > 0 && progress.completed >= progress.total

  return (
    <TooltipProvider>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void voltarAoTour()}
            className="-ml-2 w-fit text-muted-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            Voltar ao tour
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Primeiros passos</h1>
            <p className="text-sm text-muted-foreground">
              Complete estas etapas para configurar sua conta e comecar a usar o Lead Hunting Engine.
            </p>
          </div>
        </div>

        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <span className={allDone ? 'text-emerald-600' : 'text-muted-foreground'}>
            {progress.completed} de {progress.total} etapas concluidas
          </span>
          {allDone && (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          )}
        </div>

        <div className="grid gap-3">
          {items.map((item) => {
            const blocked = item.blocked === true
            const blockedReason = item.blockedReason ?? 'Disponivel no plano Pro'
            return (
              <Card
                key={item.id}
                data-testid={`checklist-item-${item.id}`}
                aria-disabled={blocked || undefined}
                className={cn(
                  'transition-colors',
                  item.completed ? 'border-emerald-200 bg-emerald-50/50' : '',
                  blocked ? 'opacity-60' : '',
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void toggleItem(item.id, item.completed)}
                        disabled={toggling === item.id || blocked}
                        aria-label={item.completed ? `Marcar "${item.label}" como pendente` : `Marcar "${item.label}" como concluido`}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-emerald-600 disabled:opacity-50 disabled:hover:text-muted-foreground"
                      >
                        {toggling === item.id ? (
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                        ) : item.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <Circle className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                      <CardTitle className={cn('text-sm font-medium', item.completed ? 'line-through text-muted-foreground' : '')}>
                        {item.label}
                        {item.required && (
                          <span className="ml-1 text-xs text-destructive" aria-label="obrigatorio">*</span>
                        )}
                      </CardTitle>
                    </div>
                    {blocked ? (
                      <Tooltip>
                        <TooltipTrigger
                          aria-disabled="true"
                          aria-label={`${item.label} indisponivel: ${blockedReason}`}
                          className="shrink-0 cursor-not-allowed text-muted-foreground/60"
                          data-testid={`checklist-link-${item.id}`}
                        >
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        </TooltipTrigger>
                        <TooltipContent>{blockedReason}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Link
                        href={item.href}
                        className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        data-testid={`checklist-link-${item.id}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">Acessar: {item.label}</span>
                      </Link>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pl-12">
                  <CardDescription className="text-xs">{item.description}</CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {items.length === 0 && (
          <p role="status" className="text-sm text-muted-foreground text-center py-8">
            Nenhuma etapa encontrada.
          </p>
        )}
      </div>
    </TooltipProvider>
  )
}
