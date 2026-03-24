import type { ToneOption } from './tone-config'
import { TONE_SYSTEM_PROMPTS, TONE_DESCRIPTIONS } from './tone-config'
import { PITCH_MAX_WORDS } from './constants'

export interface LeadContext {
  businessName: string
  category: string | null
  city: string | null
  state: string | null
  phone: string | null
  website: string | null
  rating: number | null
  reviewCount: number | null
  digitalGapScore: number // 0-100
  opportunityLabel: string // e.g. "A", "B", "WEBSITE_MISSING"
  scoreBreakdown: Record<string, unknown>
}

export function buildPitchPrompt(
  lead: LeadContext,
  tone: ToneOption
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = TONE_SYSTEM_PROMPTS[tone]

  // Construir perfil do lead com apenas dados disponíveis (anti-alucinação)
  const parts: string[] = [`Empresa: ${lead.businessName}`]
  if (lead.category) parts.push(`Setor: ${lead.category}`)
  if (lead.city)
    parts.push(`Localização: ${lead.city}${lead.state ? `, ${lead.state}` : ''}`)
  if (lead.rating)
    parts.push(`Avaliação Google: ${lead.rating}/5 (${lead.reviewCount ?? 0} avaliações)`)
  if (lead.website) parts.push(`Site: ${lead.website}`)
  else parts.push('Site: não possui')
  parts.push(
    `Score de oportunidade digital: ${lead.digitalGapScore}/100 (${lead.opportunityLabel})`
  )

  const constraints = `
REGRAS IMPORTANTES:
- Use APENAS as informações fornecidas acima. Não invente dados.
- Se não souber o nome do responsável, não tente adivinhar.
- Seja específico sobre as lacunas digitais identificadas.
- Pitch deve ter no máximo ${PITCH_MAX_WORDS} palavras.
- Termine com uma proposta de ação clara (ex: "Podemos agendar 15 minutos?").
`

  const userPrompt = `
Dados do negócio:
${parts.join('\n')}

${constraints}

Escreva um pitch de primeiro contato em português para este negócio com tom ${TONE_DESCRIPTIONS[tone]}.
`

  return { systemPrompt, userPrompt }
}
