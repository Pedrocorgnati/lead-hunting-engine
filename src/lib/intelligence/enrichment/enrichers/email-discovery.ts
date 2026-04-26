/**
 * Email discovery enricher — TASK-1 intake-review (CL-141)
 *
 * Extrai emails de fontes brutas (HTML do site, rawJson do provider) e
 * aplica a heuristica LGPD (`email-prioritizer`) para selecionar o email
 * primario. Emails pessoais so sao retidos quando nao ha generico disponivel.
 *
 * Modulo tolerante a falha: nunca lanca, sempre retorna `{ primary, secondary, sources }`.
 */

import { prioritizeEmails, type PrioritizedEmails } from './email-prioritizer'

const EMAIL_EXTRACT_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

/** Chaves no rawJson que costumam conter email institucional. */
const EMAIL_RAW_KEYS = [
  'email',
  'emails',
  'contact_email',
  'contactEmail',
  'contact_emails',
  'business_email',
  'businessEmail',
  'corporate_email',
]

/** Extrai todos os candidatos a email de um bloco de HTML/texto. Nunca lanca. */
export function extractEmailCandidatesFromHtml(html: string | null | undefined): string[] {
  if (!html || typeof html !== 'string') return []
  try {
    const matches = html.match(EMAIL_EXTRACT_RE)
    if (!matches) return []
    return [...new Set(matches.map((m) => m.toLowerCase()))]
  } catch {
    return []
  }
}

/** Coleta candidatos a email a partir das chaves conhecidas do rawJson. */
export function extractEmailsFromRawJson(rawJson: Record<string, unknown> | null | undefined): string[] {
  if (!rawJson || typeof rawJson !== 'object') return []
  const out: string[] = []
  for (const key of EMAIL_RAW_KEYS) {
    const value = (rawJson as Record<string, unknown>)[key]
    if (!value) continue
    if (typeof value === 'string') {
      out.push(value)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') out.push(item)
      }
    }
  }
  return out
}

export interface EmailDiscoveryInput {
  /** Campos brutos do lead (Google Places, scraper, etc). */
  rawJson?: Record<string, unknown> | null
  /** HTML do site (se ja disponivel — p.ex. vindo do site-audit). */
  html?: string | null
  /** Candidatos adicionais colhidos ad-hoc (ex: CNPJ databases). */
  extra?: readonly string[]
}

export interface EmailDiscoveryResult extends PrioritizedEmails {
  /** Rotulos das fontes efetivamente utilizadas. */
  sources: string[]
}

/**
 * Orquestra a descoberta: coleta candidatos das fontes disponiveis e aplica
 * `prioritizeEmails` para selecionar o email primario segundo heuristica LGPD.
 *
 * Sempre retorna um resultado — `primary = null` quando nao ha candidatos validos.
 */
export function discoverEmails(input: EmailDiscoveryInput): EmailDiscoveryResult {
  const sources: string[] = []
  const candidates: string[] = []

  const fromRaw = extractEmailsFromRawJson(input.rawJson)
  if (fromRaw.length > 0) {
    sources.push('raw_json')
    candidates.push(...fromRaw)
  }

  const fromHtml = extractEmailCandidatesFromHtml(input.html)
  if (fromHtml.length > 0) {
    sources.push('site_html')
    candidates.push(...fromHtml)
  }

  if (input.extra && input.extra.length > 0) {
    sources.push('extra')
    candidates.push(...input.extra)
  }

  const prioritized = prioritizeEmails(candidates)
  return { ...prioritized, sources }
}
