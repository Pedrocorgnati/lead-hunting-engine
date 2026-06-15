/**
 * template-vars — vocabulário canônico de placeholders dos pitch templates e o
 * render mecânico (substituição real, não decorativa). Função PURA (testável).
 *
 * DESIGN-FIRST (06-11): os templates foram desenhados primeiro (copy que vende,
 * revisada com Codex); ESTE módulo é a "alimentação" construída em cima deles.
 * Por isso o vocabulário aqui é o que os templates EXIGEM, não o que o banco
 * tinha por acaso.
 *
 * Dois grupos de placeholders:
 *  - LEAD (preenchido automático por lead): empresa, cidade, segmento, problema
 *  - REMETENTE (perfil do operador, 1x): meu_nome, minha_empresa, meu_whatsapp,
 *    meu_portfolio
 *
 * `{{problema}}` é gerado como FRASE FACTUAL NEUTRA (observação, nunca acusação —
 * regra de copy do review Codex): "vocês ainda não têm um site próprio", etc.
 */

export interface PlaceholderDef {
  key: string
  label: string
  example: string
  group: 'lead' | 'remetente'
}

/** Vocabulário canônico exibido na UI e substituído no render. */
export const TEMPLATE_PLACEHOLDERS: readonly PlaceholderDef[] = [
  { key: 'empresa', label: 'Empresa', example: 'Clínica Santa Maria', group: 'lead' },
  { key: 'cidade', label: 'Cidade', example: 'Lorena', group: 'lead' },
  { key: 'segmento', label: 'Segmento', example: 'clínica médica', group: 'lead' },
  { key: 'problema', label: 'Problema observado', example: 'vocês ainda não têm um site próprio', group: 'lead' },
  { key: 'meu_nome', label: 'Seu nome', example: 'Pedro Corgnati', group: 'remetente' },
  { key: 'minha_empresa', label: 'Sua empresa', example: 'Corgnati Tech', group: 'remetente' },
  { key: 'meu_whatsapp', label: 'Seu WhatsApp', example: '(12) 99999-9999', group: 'remetente' },
  { key: 'meu_portfolio', label: 'Seu portfólio', example: 'corgnati.com', group: 'remetente' },
]

export const TEMPLATE_PLACEHOLDER_KEYS = TEMPLATE_PLACEHOLDERS.map((p) => p.key)
export const TEMPLATE_PLACEHOLDER_REGEX = String.raw`\{\{\s*([a-zA-Z0-9_]+)\s*\}\}`

export interface SenderProfile {
  name: string
  company: string
  whatsapp: string
  portfolio: string
}

export interface LeadLike {
  businessName?: string | null
  city?: string | null
  niche?: string | null
  website?: string | null
  opportunities?: string[] | null
  signals?: string[] | null
}

/**
 * Frase factual neutra do "problema/gap" do lead — observação, não acusação.
 * Prioriza o sinal/oportunidade mais relevante; cai num genérico seguro.
 */
export function leadProblemPhrase(lead: LeadLike): string {
  const opp = lead.opportunities?.[0]
  const hasSite = Boolean(lead.website && lead.website.trim())
  if (!hasSite) return 'vocês ainda não têm um site próprio aparecendo no perfil'
  switch (opp) {
    case 'A_NEEDS_SITE':
      return 'vocês ainda não têm um site próprio aparecendo no perfil'
    case 'B_NEEDS_SYSTEM':
      return 'dá pra organizar melhor os atendimentos e a agenda com um sistema simples'
    case 'C_NEEDS_AUTOMATION':
      return 'parte do atendimento repetitivo ainda é manual e dá pra automatizar'
    case 'D_NEEDS_ECOMMERCE':
      return 'ainda não dá pra comprar/pedir online de forma simples'
    case 'E_SCALE':
      return 'tem espaço pra fortalecer a presença digital de vocês'
    default:
      return 'a presença digital de vocês ainda dá pra deixar mais completa para quem vem do Google'
  }
}

export function buildLeadVars(lead: LeadLike): Record<string, string> {
  return {
    empresa: lead.businessName?.trim() || 'seu negócio',
    cidade: lead.city?.trim() || 'sua região',
    segmento: lead.niche?.trim() || 'negócios locais',
    problema: leadProblemPhrase(lead),
  }
}

export function buildSenderVars(profile: SenderProfile): Record<string, string> {
  return {
    meu_nome: profile.name,
    minha_empresa: profile.company,
    meu_whatsapp: profile.whatsapp,
    meu_portfolio: profile.portfolio,
  }
}

/**
 * Substitui `{{chave}}` pelos valores fornecidos. Mantém o placeholder literal
 * quando a chave é desconhecida (evita apagar texto por engano) MAS troca
 * chaves conhecidas com valor vazio por '' (ex.: WhatsApp ainda não configurado).
 */
export function renderTemplateVars(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key] ?? ''
    return whole
  })
}

/** Conveniência: render completo a partir de lead + perfil do remetente. */
export function renderPitch(content: string, lead: LeadLike, sender: SenderProfile): string {
  return renderTemplateVars(content, { ...buildLeadVars(lead), ...buildSenderVars(sender) })
}
