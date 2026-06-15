/**
 * Email prioritizer — TASK-1 intake-review (CL-141) + feature
 * "aumentar descoberta de e-mails e WhatsApp" (blacksmith 06-11).
 *
 * Heuristica LGPD: emails genericos/institucionais (contato@, vendas@, sac@)
 * sao preferidos a emails pessoais (joao.silva@) quando multiplos candidatos
 * forem descobertos em um mesmo dominio. Reduz coleta de PII desnecessaria.
 *
 * Incremento 06-11: `classifyEmailDomain` compara o dominio registravel do
 * email com o do website canonico do lead (suporte a sufixos compostos como
 * .com.br), permitindo que o email-discovery impeca dominio externo de vencer
 * apenas por prefixo generico.
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

// O regex de extracao casa nomes de arquivo de sprite/asset embutidos no HTML
// (ex.: `ajax-loader@2x.gif`, `icon@3x.png`). Sintaticamente parecem e-mail mas
// nao sao. Rejeitamos quando o "dominio" termina numa extensao de arquivo
// conhecida ou quando o local-part e um sufixo retina (@2x/@3x).
const ASSET_TLD_RE = /\.(png|jpe?g|gif|svg|webp|ico|bmp|tiff?|css|js|mjs|json|woff2?|ttf|eot|pdf|mp4|webm|mov|avif|map)$/i
const RETINA_LOCAL_RE = /^\d+x$/i

function isAssetFilenameEmail(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at <= 0) return false
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  return ASSET_TLD_RE.test(domain) || RETINA_LOCAL_RE.test(domain.split('.')[0]) || RETINA_LOCAL_RE.test(local)
}

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
    if (isAssetFilenameEmail(clean)) continue
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

/** Classe de dominio de um email em relacao ao website canonico do lead. */
export type EmailDomainClass = 'canonical' | 'external' | 'unknown'

/**
 * Sufixos publicos compostos (segundo nivel) mais comuns — o dominio
 * registravel e o label imediatamente anterior ao sufixo. Para
 * `loja.empresa.com.br` o sufixo e `com.br` e o registravel e `empresa.com.br`.
 *
 * Lista intencionalmente curta (NAO e a Public Suffix List completa): o foco
 * do produto e Brasil. Limitacao conhecida: sufixo composto fora da lista
 * degrada para comparacao de 2 labels — dominios irmaos do mesmo ccTLD
 * composto nao listado podem gerar falso 'canonical'. Risco aceito.
 */
const MULTI_LABEL_PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  'com.br',
  'net.br',
  'org.br',
  'gov.br',
  'edu.br',
  'adv.br',
  'agr.br',
  'arq.br',
  'art.br',
  'blog.br',
  'eco.br',
  'emp.br',
  'eng.br',
  'far.br',
  'ind.br',
  'inf.br',
  'jor.br',
  'med.br',
  'odo.br',
  'pro.br',
  'psc.br',
  'psi.br',
  'rec.br',
  'srv.br',
  'tur.br',
  'tv.br',
  'vet.br',
  'co.uk',
  'org.uk',
  'ac.uk',
  'com.au',
  'com.ar',
  'com.mx',
  'com.co',
  'com.pt',
  'com.py',
  'com.uy',
  'co.jp',
  'co.za',
  'com.tr',
])

/** Extrai o dominio registravel de um hostname (suporte a sufixos compostos como .com.br). */
function registrableDomain(hostname: string): string | null {
  const clean = hostname.trim().toLowerCase().replace(/\.+$/, '')
  const labels = clean.split('.').filter((label) => label.length > 0)
  if (labels.length < 2) return null
  const lastTwo = labels.slice(-2).join('.')
  if (MULTI_LABEL_PUBLIC_SUFFIXES.has(lastTwo)) {
    // O proprio sufixo (ex: 'com.br') nao e um dominio registravel.
    if (labels.length < 3) return null
    return labels.slice(-3).join('.')
  }
  return lastTwo
}

/** Resolve o dominio registravel do website do lead. Tolerante a URL sem protocolo. */
function websiteRegistrableDomain(websiteUrl: string | null | undefined): string | null {
  if (!websiteUrl || typeof websiteUrl !== 'string') return null
  const trimmed = websiteUrl.trim()
  if (!trimmed) return null
  let hostname: string
  try {
    hostname = new URL(trimmed).hostname
  } catch {
    try {
      hostname = new URL(`https://${trimmed}`).hostname
    } catch {
      return null
    }
  }
  if (!hostname || !hostname.includes('.')) return null
  return registrableDomain(hostname)
}

/**
 * Classifica o dominio de um email em relacao ao website canonico do lead.
 *
 * - 'canonical': mesmo dominio registravel do site — subdominios contam
 *   (`contato@loja.empresa.com.br` e canonical para `https://www.empresa.com.br`);
 * - 'external': dominio registravel diferente (gmail.com, plataforma de site,
 *   rodape de agencia);
 * - 'unknown': websiteUrl ausente/invalido ou email invalido.
 *
 * Usado pelo email-discovery para impedir que email de dominio externo venca
 * o canonico apenas por ter prefixo generico (criterios 6-7 do doc da feature).
 */
export function classifyEmailDomain(email: string, websiteUrl: string | null | undefined): EmailDomainClass {
  const siteDomain = websiteRegistrableDomain(websiteUrl)
  if (!siteDomain) return 'unknown'
  if (!email || typeof email !== 'string') return 'unknown'
  const clean = normalize(email)
  if (!EMAIL_RE.test(clean)) return 'unknown'
  const parts = splitEmail(clean)
  if (!parts) return 'unknown'
  const emailDomain = registrableDomain(parts.domain)
  if (!emailDomain) return 'unknown'
  return emailDomain === siteDomain ? 'canonical' : 'external'
}
