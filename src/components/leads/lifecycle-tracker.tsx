'use client'
import { useState } from 'react'
import { Check, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/utils/api-client'
import { useToast } from '@/lib/hooks/use-toast'
import { LeadStatus, LEAD_STATUS_MAP } from '@/lib/constants/enums'
import { API_ROUTES } from '@/lib/constants/routes'

interface Props {
  leadId: string
  currentStatus: string
  onStatusChange?: (status: string) => void
}

const LIFECYCLE_STEPS: { status: string; label: string; description: string }[] = [
  { status: LeadStatus.NEW, label: 'Novo', description: 'Lead identificado pela coleta' },
  { status: LeadStatus.CONTACTED, label: 'Contatado', description: 'Primeiro contato realizado' },
  { status: LeadStatus.NEGOTIATING, label: 'Negociando', description: 'Proposta em andamento' },
  { status: LeadStatus.CONVERTED, label: 'Convertido', description: 'Lead virou cliente!' },
]

const TERMINAL_STEPS: { status: string; label: string; description: string; color: string }[] = [
  { status: LeadStatus.DISCARDED, label: 'Perdido', description: 'Oportunidade encerrada', color: 'text-destructive border-destructive/30' },
  { status: LeadStatus.DISQUALIFIED, label: 'Desqualificado', description: 'Não se encaixa no perfil', color: 'text-warning border-warning/30' },
]

const getStatusLabel = (status: string) =>
  LEAD_STATUS_MAP[status as keyof typeof LEAD_STATUS_MAP]?.label ?? status

const STEP_INDEX: Record<string, number> = Object.fromEntries(
  LIFECYCLE_STEPS.map((s, i) => [s.status, i])
)

const TERMINAL_STATUSES = new Set(TERMINAL_STEPS.map((t) => t.status))

export function LifecycleTracker({ leadId, currentStatus, onStatusChange }: Props) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [status, setStatus] = useState(currentStatus)

  const currentIndex = STEP_INDEX[status] ?? -1
  const isTerminal = TERMINAL_STATUSES.has(status)

  async function handleTransition(newStatus: string) {
    if (saving) return
    setSaving(true)
    const res = await apiClient.patch(API_ROUTES.LEAD_STATUS(leadId), {
      status: newStatus,
      ...(newStatus === LeadStatus.CONTACTED ? { contactedAt: new Date().toISOString() } : {}),
    })
    setSaving(false)
    setPendingStatus(null)

    if (res.error) {
      toast.error('Erro ao atualizar status.')
      return
    }

    setStatus(newStatus)
    onStatusChange?.(newStatus)
    toast.success(`Status atualizado para "${getStatusLabel(newStatus)}".`)
  }

  const terminalStep = TERMINAL_STEPS.find((t) => t.status === status)

  return (
    <div className="rounded-lg border p-4 space-y-4" data-testid="lifecycle-tracker">
      <h3 className="font-semibold">Ciclo de vida</h3>

      <div className="relative overflow-x-auto">
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-muted" aria-hidden="true" />
        <ol className="relative flex justify-between min-w-[300px]" aria-label="Ciclo de vida do lead">
          {LIFECYCLE_STEPS.map((step, index) => {
            const isDone = !isTerminal && index < currentIndex
            const isCurrent = !isTerminal && index === currentIndex
            const isNext = !isTerminal && index === currentIndex + 1

            return (
              <li key={step.status} className="flex flex-col items-center gap-1 flex-1">
                <button
                  onClick={() => isNext ? setPendingStatus(step.status) : undefined}
                  disabled={!isNext || saving}
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                    isDone
                      ? 'bg-success border-success text-success-foreground'
                      : isCurrent
                      ? 'bg-primary border-primary text-primary-foreground'
                      : isNext
                      ? 'bg-background border-primary text-primary hover:bg-primary/10 cursor-pointer'
                      : 'bg-background border-muted text-muted-foreground cursor-not-allowed'
                  }`}
                  aria-label={`${step.label}: ${isDone ? 'concluído' : isCurrent ? 'atual' : isNext ? 'próximo — clicar para avançar' : 'pendente'}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  title={step.description}
                >
                  {isDone
                    ? <Check className="h-4 w-4" aria-hidden="true" />
                    : <Circle className="h-4 w-4" aria-hidden="true" />
                  }
                </button>
                <span className={`text-xs text-center max-w-[60px] whitespace-nowrap ${isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      {isTerminal && terminalStep && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${terminalStep.color}`} role="status" aria-live="polite">
          <span className="font-medium">{terminalStep.label}</span>
          <span className="ml-2 text-muted-foreground">{terminalStep.description}</span>
        </div>
      )}

      {!isTerminal && status !== LeadStatus.CONVERTED && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {TERMINAL_STEPS.map((t) => (
            <Button
              key={t.status}
              variant="ghost"
              size="sm"
              onClick={() => setPendingStatus(t.status)}
              disabled={saving}
              className="text-xs min-h-[44px]"
            >
              Marcar como {t.label}
            </Button>
          ))}
        </div>
      )}

      {pendingStatus && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lifecycle-confirm-title"
          onClick={(e) => e.target === e.currentTarget && setPendingStatus(null)}
        >
          <div className="bg-background rounded-lg border p-6 space-y-4 max-w-sm w-full mx-4 shadow-xl">
            <h4 id="lifecycle-confirm-title" className="font-semibold">Confirmar transição</h4>
            <p className="text-sm text-muted-foreground">
              Alterar status para <strong>&quot;{getStatusLabel(pendingStatus)}&quot;</strong>?
              {pendingStatus === LeadStatus.CONTACTED && (
                <span className="block mt-1 text-xs">A data de contato será registrada automaticamente.</span>
              )}
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingStatus(null)}
                disabled={saving}
                className="min-h-[44px]"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => handleTransition(pendingStatus)}
                disabled={saving}
                className="min-h-[44px]"
              >
                {saving ? 'Salvando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
