'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2, Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateLeadStatus } from '@/actions/leads'
import { LeadStatus } from '@/lib/constants/enums'

interface RadarActionsProps {
  leadId: string
  status: string
}

export function RadarActions({ leadId, status }: RadarActionsProps) {
  const [pending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState(status)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const alreadySaved = localStatus === LeadStatus.NEGOTIATING || localStatus === LeadStatus.CONTACTED
  const alreadyDiscarded = localStatus === LeadStatus.DISCARDED

  function handleUpdate(next: LeadStatus, optimistic: string) {
    setError(null)
    startTransition(async () => {
      try {
        await updateLeadStatus(leadId, next)
        setLocalStatus(optimistic)
        router.refresh()
      } catch (e) {
        setError((e as Error).message || 'Falha ao atualizar')
      }
    })
  }

  return (
    <div className="flex items-center gap-2 pt-2">
      <Button
        size="sm"
        variant={alreadySaved ? 'secondary' : 'default'}
        disabled={pending || alreadySaved}
        onClick={() => handleUpdate(LeadStatus.NEGOTIATING, LeadStatus.NEGOTIATING)}
        data-testid={`radar-save-${leadId}`}
        aria-label="Salvar lead em carteira"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" />
        ) : alreadySaved ? (
          <Check className="h-3 w-3 mr-1" aria-hidden="true" />
        ) : (
          <Bookmark className="h-3 w-3 mr-1" aria-hidden="true" />
        )}
        {alreadySaved ? 'Em carteira' : 'Salvar em carteira'}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || alreadyDiscarded}
        onClick={() => handleUpdate(LeadStatus.DISCARDED, LeadStatus.DISCARDED)}
        data-testid={`radar-discard-${leadId}`}
        aria-label="Descartar lead"
      >
        <X className="h-3 w-3 mr-1" aria-hidden="true" />
        {alreadyDiscarded ? 'Descartado' : 'Descartar'}
      </Button>
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
