'use client'

import { Users, Filter, MessageSquare } from 'lucide-react'

const HIGHLIGHTS = [
  {
    icon: Users,
    title: 'Painel central de leads',
    body: 'Todos os leads coletados aparecem em Leads, com pontuação, temperatura e proveniência.',
  },
  {
    icon: Filter,
    title: 'Filtros que importam',
    body: 'Combine 8 dimensões (status, temperatura, fonte, score) para focar em quem está pronto para responder.',
  },
  {
    icon: MessageSquare,
    title: 'Pitch sob demanda',
    body: 'Gere mensagens personalizadas com IA e copie em um clique. Tom configurável conforme o lead.',
  },
]

export function StepOperatorLeads() {
  return (
    <div
      data-testid="onboarding-step-operator-leads"
      className="w-full space-y-4 text-left"
    >
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-foreground">Primeiros passos com Leads</h2>
        <p className="text-sm text-muted-foreground">
          Aqui está o resumo do que esperar ao chegar no painel principal de trabalho.
        </p>
      </div>

      <ul className="space-y-3">
        {HIGHLIGHTS.map((item) => (
          <li
            key={item.title}
            className="flex items-start gap-3 rounded-md border border-border p-3"
          >
            <span className="rounded-md bg-primary/10 p-2">
              <item.icon className="h-4 w-4 text-primary" aria-hidden="true" />
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Quando estiver pronto, clique em &ldquo;Ir para o Dashboard&rdquo; abaixo para começar.
      </p>
    </div>
  )
}
