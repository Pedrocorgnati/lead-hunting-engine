import { Badge } from '@/components/ui/badge'

/**
 * outreach-engine (brainstorm 06-10, task 29): chip de prontidão de contato
 * (green/yellow/red, secao 13 do fonte) derivado do integrityScore do lead.
 *  >= 70 verde (pronto) · 40-69 amarelo (revisar) · < 40 vermelho (dado fraco).
 * Sem score = neutro. Acessível: texto + cor (nunca só cor).
 */
export function ReadinessChip({ integrityScore }: { integrityScore: number | null }) {
  if (integrityScore === null || integrityScore === undefined) {
    return (
      <Badge variant="outline" className="text-xs" data-testid="lead-readiness-unknown">
        Sem dado
      </Badge>
    )
  }
  const level = integrityScore >= 70 ? 'pronto' : integrityScore >= 40 ? 'revisar' : 'fraco'
  const variant = level === 'pronto' ? 'default' : level === 'revisar' ? 'secondary' : 'destructive'
  const label = level === 'pronto' ? 'Pronto' : level === 'revisar' ? 'Revisar' : 'Dado fraco'
  return (
    <Badge variant={variant} className="text-xs" data-testid={`lead-readiness-${level}`} title={`Integridade ${integrityScore}/100`}>
      {label}
    </Badge>
  )
}

/**
 * Ação principal sugerida (Disparo/Revisar/Pausar/Reprocessar) — link de 1
 * clique para o detalhe do lead onde a ação é executada.
 */
const NEXT_ACTION_LABEL: Record<string, string> = {
  follow_up: 'Follow-up',
  human_review: 'Revisar',
  schedule_meeting: 'Agendar',
  close_lost: 'Encerrar',
  close_won_path: 'Negociar',
  enrich_again: 'Reprocessar',
  none: 'Disparo',
}

export function NextActionChip({ nextAction }: { nextAction: string | null }) {
  if (!nextAction) return null
  const label = NEXT_ACTION_LABEL[nextAction] ?? nextAction
  return (
    <Badge variant="outline" className="text-xs" data-testid={`lead-next-action-${nextAction}`}>
      {label}
    </Badge>
  )
}
