/**
 * WhatsApp channel detector — TASK-3 intake-review (CL-058)
 *
 * Detecta se o negocio usa WhatsApp como canal principal de atendimento.
 * Puro, sem chamadas externas. Opera sobre HTML capturado e telefone ja coletado.
 *
 * Feature aumentar e-mails/WhatsApp (blacksmith 06-11, Task 6): alem de
 * pontuar confianca, extrai os numeros embutidos em links wa.me e
 * api.whatsapp.com/send?phone= (campo `extractedNumbers`), normalizados
 * para '+<digitos>' e validados contra E.164 (8-15 digitos).
 *
 * Nota sobre o parametro `phone`: ele continua aceito (participa apenas do
 * early-return quando nao ha HTML). A derivacao de nivel 'probable' a partir
 * do telefone do lead NAO acontece aqui — e responsabilidade da pipeline,
 * via classifyBRPhone/isMobileBR (phone-classifier.ts), mantendo este
 * detector restrito a evidencia de HTML.
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
  /**
   * Numeros extraidos de links wa.me/<n> e api.whatsapp.com/send?phone=<n>,
   * normalizados para '+<digitos>', deduplicados, em ordem de aparicao.
   * Links malformados sao ignorados em silencio (nunca lanca).
   */
  extractedNumbers: string[]
}

// Candidatos a numero embutido em link. Captura tolerante — a validacao
// rigorosa (E.164, separadores) acontece em normalizeWaCandidate.
const WA_NUMBER_SOURCES: RegExp[] = [
  // wa.me/<valor> — para em ?, #, &, aspas, espacos ou fim de atributo.
  /https?:\/\/wa\.me\/([^"'\s<>?#&]+)/gi,
  // api.whatsapp.com/send?...phone=<valor> — phone pode nao ser o 1o parametro.
  /api\.whatsapp\.com\/send\?(?:[^"'\s<>&]*&)*phone=([^"'\s<>&#]+)/gi,
]

// Separadores ignoraveis dentro do candidato (no maximo 2 por numero).
const WA_SEPARATOR_RE = /[\s().-]/g

/**
 * Normaliza um candidato capturado de link para '+<digitos>'.
 * Regras: aceita '+' literal ou '%2B'; tolera ate 2 separadores ignoraveis
 * (espaco/parentese/ponto/hifen, inclusive '%20'); exige 8-15 digitos
 * (E.164). Retorna null para candidato malformado — nunca lanca.
 */
function normalizeWaCandidate(raw: string): string | null {
  // Decodifica apenas os escapes relevantes ('+' e espaco); decodeURIComponent
  // completo poderia lancar em sequencias invalidas.
  let candidate = raw.replace(/%2B/gi, '+').replace(/%20/gi, ' ')

  // '+' so e valido como primeiro caractere.
  if (candidate.startsWith('+')) candidate = candidate.slice(1)
  if (candidate.includes('+')) return null

  const separators = candidate.match(WA_SEPARATOR_RE)
  if (separators && separators.length > 2) return null
  candidate = candidate.replace(WA_SEPARATOR_RE, '')

  // Qualquer caractere restante que nao seja digito = link malformado.
  if (!/^\d+$/.test(candidate)) return null

  // E.164: 8-15 digitos.
  if (candidate.length < 8 || candidate.length > 15) return null

  return `+${candidate}`
}

/**
 * Extrai numeros de WhatsApp de links no HTML. Pura, nunca lanca;
 * malformados sao descartados em silencio. Resultado deduplicado.
 */
function extractWaNumbers(html: string): string[] {
  const found = new Set<string>()
  for (const source of WA_NUMBER_SOURCES) {
    // Regexes com flag g guardam lastIndex — reseta para manter a funcao pura.
    source.lastIndex = 0
    for (const match of html.matchAll(source)) {
      const normalized = normalizeWaCandidate(match[1])
      if (normalized) found.add(normalized)
    }
  }
  return [...found]
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
    return { isWhatsappChannel: false, confidence: 0, evidence: [], extractedNumbers: [] }
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

  return { isWhatsappChannel, confidence, evidence, extractedNumbers: extractWaNumbers(html) }
}
