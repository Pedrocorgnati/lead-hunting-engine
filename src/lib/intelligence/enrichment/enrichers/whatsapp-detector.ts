/**
 * WhatsApp channel detector — TASK-3 intake-review (CL-058)
 *
 * Detecta se o negocio usa WhatsApp como canal principal de atendimento.
 * Puro, sem chamadas externas. Opera sobre HTML capturado e telefone ja coletado.
 */

export interface WhatsappDetectorInput {
  html?: string | null
  phone?: string | null
  /** Sinal opcional: site tem formulario de contato real (vindo de ux-analyzer). */
  hasContactForm?: boolean | null
}

export interface WhatsappDetectorResult {
  isWhatsappChannel: boolean
  confidence: number // 0..1
  evidence: string[]
}

const WA_LINK_PATTERNS: Array<{ re: RegExp; tag: string; weight: number }> = [
  { re: /https?:\/\/wa\.me\/[0-9+]{8,}/i, tag: 'wa.me-link', weight: 0.6 },
  { re: /api\.whatsapp\.com\/send\?phone=/i, tag: 'api.whatsapp.com-link', weight: 0.6 },
  { re: /https?:\/\/(chat|w)\.whatsapp\.com\//i, tag: 'chat.whatsapp.com-link', weight: 0.4 },
]

const WA_TEXT_PATTERNS: Array<{ re: RegExp; tag: string; weight: number }> = [
  { re: /chame\s+(no|pelo)\s+whats\s*app/i, tag: 'text-chame-whatsapp', weight: 0.3 },
  { re: /fale\s+(con)?conosco\s+(no|via|pelo)\s+whats\s*app/i, tag: 'text-fale-whatsapp', weight: 0.3 },
  { re: /atendimento\s+(via|pelo|no)\s+whats\s*app/i, tag: 'text-atendimento-whatsapp', weight: 0.3 },
  { re: /whats\s*app\s*:\s*\+?\d{2,}/i, tag: 'text-whatsapp-number', weight: 0.3 },
]

const WA_ICON_PATTERNS: Array<{ re: RegExp; tag: string; weight: number }> = [
  { re: /class=["'][^"']*(whatsapp|float-whats|wa-float|btn-whatsapp)[^"']*["']/i, tag: 'float-button', weight: 0.3 },
  { re: /<i[^>]+class=["'][^"']*fa-whatsapp[^"']*["']/i, tag: 'fa-whatsapp-icon', weight: 0.2 },
]

export function detectWhatsapp(input: WhatsappDetectorInput): WhatsappDetectorResult {
  const html = input.html ?? ''
  const evidence: string[] = []
  let confidence = 0

  if (!html && !input.phone) {
    return { isWhatsappChannel: false, confidence: 0, evidence: [] }
  }

  for (const { re, tag, weight } of WA_LINK_PATTERNS) {
    if (re.test(html)) {
      evidence.push(tag)
      confidence += weight
    }
  }
  for (const { re, tag, weight } of WA_TEXT_PATTERNS) {
    if (re.test(html)) {
      evidence.push(tag)
      confidence += weight
    }
  }
  for (const { re, tag, weight } of WA_ICON_PATTERNS) {
    if (re.test(html)) {
      evidence.push(tag)
      confidence += weight
    }
  }

  // Heuristica: telefone clickable (tel:) + ausencia de formulario de contato
  // sugere WhatsApp implicito em pequenos negocios BR.
  const hasTelLink = /href=["']tel:\+?\d{8,}/i.test(html)
  const hasContactForm = input.hasContactForm === true || /<form[^>]*(contact|contato|fale-conosco)[^>]*>/i.test(html)
  if (hasTelLink && !hasContactForm) {
    evidence.push('tel-link-without-form')
    confidence += 0.2
  }

  confidence = Math.min(1, Math.round(confidence * 100) / 100)
  const isWhatsappChannel = confidence >= 0.3 && evidence.length > 0

  return { isWhatsappChannel, confidence, evidence }
}
