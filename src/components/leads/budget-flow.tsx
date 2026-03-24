'use client'

import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BudgetFlowProps {
  leadId: string
  leadName: string
  budgetFlowUrl?: string
}

export function BudgetFlow({ leadId, leadName, budgetFlowUrl }: BudgetFlowProps) {
  const [isRedirecting, setIsRedirecting] = useState(false)

  if (!budgetFlowUrl) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orçamento</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Integração com BudgetFlow não configurada. Configure a URL do BudgetFlow nas configurações do admin.
          </p>
        </CardContent>
      </Card>
    )
  }

  const targetUrl = new URL(budgetFlowUrl)
  targetUrl.searchParams.set('lead_id', leadId)
  targetUrl.searchParams.set('lead_name', encodeURIComponent(leadName))

  function handleRedirect() {
    setIsRedirecting(true)
    window.open(targetUrl.toString(), '_blank', 'noopener,noreferrer')
    setTimeout(() => setIsRedirecting(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Orçamento</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          Gere um orçamento para este lead via BudgetFlow.
        </p>
        <Button
          onClick={handleRedirect}
          disabled={isRedirecting}
          data-testid="budget-flow-redirect"
        >
          {isRedirecting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Redirecionando...
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
              Abrir BudgetFlow
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
