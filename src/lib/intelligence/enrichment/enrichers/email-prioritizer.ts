/**
 * Email prioritizer — TASK-1 intake-review (CL-141)
 *
 * Heuristica LGPD: emails genericos/institucionais (contato@, vendas@, sac@)
 * sao preferidos a emails pessoais (joao.silva@) quando multiplos candidatos
 * forem descobertos em um mesmo dominio. Reduz coleta de PII desnecessaria.
 *
 * Modulo puro (sem I/O). Nunca lanca.
 */

/** Prefixos considerados genericos/institucionais (lowercase, antes do @). */
export const GENERIC_EMAIL_PREFIXES: readonly string[] = [
  'contato',
  'contact',
  'vendas',
  'sales',
  'sac',
  'comercial',
  'atendimento',
  'financeiro',
  'finance',
  'rh',
  'hr',
  'info',
  'suporte',
  'support',
  'hello',
  'oi',
  'ola',
  'admin',
  'no-reply',
  'noreply',
  'marketing',
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalize(email: string): string {
  return email.trim().toLowerCase()
}

function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return null
  return {
    local: email.slice(0, at),
    domain: email.slice(at + 1),
  }
}

/** Primeiro segmento do local-part (antes de `.`, `+`, `-`, `_`). */
function primaryLocalToken(local: string): string {
  return local.split(/[.+\-_]/, 1)[0] ?? local
}

/**
 * Retorna true se o email parece institucional/generico.
 * Compara o primeiro token do local-part contra `GENERIC_EMAIL_PREFIXES`.
 * Emails invalidos retornam false.
 */
export function isGenericEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const clean = normalize(email)
  if (!EMAIL_RE.test(clean)) return false
  const parts = splitEmail(clean)
  if (!parts) return false
  const token = primaryLocalToken(parts.local)
  return GENERIC_EMAIL_PREFIXES.includes(token)
}

export interface PrioritizedEmails {
  /** Melhor candidato segundo a heuristica LGPD (generico preferido). `null` se nenhum valido. */
  primary: string | null
  /** Demais emails validos, deduplicados, ordenados: genericos primeiro, pessoais depois. */
  secondary: string[]
}

/**
 * Ordena emails por preferencia LGPD e retorna `primary` + `secondary`.
 *
 * Regras:
 *  - Normaliza (trim + lowercase) e deduplica.
 *  - Descarta emails sintaticamente invalidos.
 *  - Ordena: genericos > pessoais, preservando ordem relativa de entrada (stable).
 *  - `primary` = primeiro da lista ordenada (ou `null` se vazia).
 *
 * Observacao: esta funcao NAO agrupa por dominio por padrao — o caller decide
 * se quer aplicar por dominio chamando uma vez por grupo. Ver
 * `prioritizeEmailsByDomain` para agrupamento automatico.
 */
export function prioritizeEmails(emails: readonly string[] | null | undefined): PrioritizedEmails {
  if (!emails || emails.length === 0) return { primary: null, secondary: [] }

  const seen = new Set<string>()
  const valid: string[] = []
  for (const raw of emails) {
    if (typeof raw !== 'string') continue
    const clean = normalize(raw)
    if (!EMAIL_RE.test(clean)) continue
    if (seen.has(clean)) continue
    seen.add(clean)
    valid.push(clean)
  }

  if (valid.length === 0) return { primary: null, secondary: [] }

  const generics: string[] = []
  const personals: string[] = []
  for (const e of valid) {
    if (isGenericEmail(e)) generics.push(e)
    else personals.push(e)
  }

  const ordered = [...generics, ...personals]
  return {
    primary: ordered[0] ?? null,
    secondary: ordered.slice(1),
  }
}

/**
 * Agrupa emails por dominio e aplica `prioritizeEmails` em cada grupo.
 * Util quando o scraper colhe emails de dominios distintos numa so passada
 * (ex: site principal + site do proprietario). Primary do dominio canonico
 * deve ser escolhido pelo caller — aqui retornamos o mapa.
 */
export function prioritizeEmailsByDomain(
  emails: readonly string[] | null | undefined,
): Map<string, PrioritizedEmails> {
  const byDomain = new Map<string, string[]>()
  if (!emails) return new Map()
  for (const raw of emails) {
    if (typeof raw !== 'string') continue
    const clean = normalize(raw)
    if (!EMAIL_RE.test(clean)) continue
    const parts = splitEmail(clean)
    if (!parts) continue
    const bucket = byDomain.get(parts.domain) ?? []
    bucket.push(clean)
    byDomain.set(parts.domain, bucket)
  }
  const result = new Map<string, PrioritizedEmails>()
  for (const [domain, list] of byDomain) {
    result.set(domain, prioritizeEmails(list))
  }
  return result
}
