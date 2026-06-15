/**
 * Email discovery enricher — TASK-1 intake-review (CL-141) + feature
 * "aumentar descoberta de e-mails e WhatsApp" (blacksmith 06-11).
 *
 * Extrai emails de fontes brutas (HTML do site, rawJson do provider) e
 * aplica a heuristica LGPD (`email-prioritizer`) para selecionar o email
 * primario. Emails pessoais so sao retidos quando nao ha generico disponivel.
 *
 * Incrementos da feature 06-11 (criterios 5-8 do doc):
 *  - `extractEmailsFromRawJson` percorre objetos E arrays aninhados com
 *    limites HARD (profundidade, nos visitados, tamanho de string) e denylist
 *    de chaves pessoais/sensiveis (subarvore denylisted nao e percorrida);
 *  - `extractEmailCandidatesFromHtml` cobre `mailto:`, JSON-LD e ofuscacoes
 *    simples com delimitador explicito ([at]/(at)/[arroba]/[dot]), alem das
 *    entidades HTML &#64;/&commat;;
 *  - `discoverEmails` usa o dominio canonico do website (quando informado)
 *    para impedir que email de dominio externo venca apenas por prefixo
 *    generico: canonical-generico > canonical-pessoal > external-generico >
 *    external-pessoal.
 *
 * Modulo tolerante a falha: nunca lanca, sempre retorna `{ primary, secondary, sources }`.
 */

import {
  classifyEmailDomain,
  isGenericEmail,
  prioritizeEmails,
  type EmailDomainClass,
  type PrioritizedEmails,
} from './email-prioritizer'

const EMAIL_EXTRACT_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

/**
 * Limites HARD do traversal recursivo (criterio 5 do doc da feature).
 * Payloads de provider sao arbitrarios — os limites garantem custo maximo
 * previsivel mesmo com rawJson hostil ou gigante.
 */
const RAW_JSON_MAX_DEPTH = 6
const RAW_JSON_MAX_NODES = 2000
const RAW_JSON_MAX_STRING_LENGTH = 10000

/**
 * Denylist de chaves pessoais/sensiveis (criterio 6 do doc): match
 * case-insensitive por substring no nome da chave, com normalizacao de
 * diacriticos (NFD) — o dominio de dados e pt-BR, entao 'proprietário' e
 * 'proprietario' casam igual. A subarvore inteira sob uma chave denylisted
 * NAO e percorrida — fail-closed por design: melhor perder recall do que
 * coletar PII de socio/proprietario ou credencial.
 *
 * Review 06-11 R2-2 (LGPD): tokens pt-BR adicionados — a lista English-only
 * deixava {"proprietario":{"email_pessoal":...}} vazar pelo traversal
 * ('pessoal' nao casa 'personal'). Mesmos tokens espelhados em PII_KEYS de
 * data-normalizer.ts (sanitizeRawJson).
 */
const SENSITIVE_KEY_DENYLIST: readonly string[] = [
  'owner',
  'personal',
  'private',
  'cpf',
  'rg',
  'birth',
  'ssn',
  'social_security',
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'proprietario',
  'dono',
  'socio',
  'responsavel',
  'titular',
  'pessoal',
  'nascimento',
  'celular',
]

/** Lowercase + NFD sem diacriticos, para o match de chave cobrir 'sócio'/'socio'. */
function normalizeKeyForMatch(key: string): string {
  return key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function isDenylistedKey(key: string): boolean {
  const normalized = normalizeKeyForMatch(key)
  return SENSITIVE_KEY_DENYLIST.some((blocked) => normalized.includes(blocked))
}

/** Chave cujo nome contem 'email' contribui valor string/array direto como candidato. */
function isEmailKey(key: string): boolean {
  return normalizeKeyForMatch(key).includes('email')
}

interface EmailTraversalState {
  nodesVisited: number
  /** Protecao contra ciclos/referencias repetidas (payloads vem de JSON.parse, mas defendemos mesmo assim). */
  visited: WeakSet<object>
  out: string[]
  seen: Set<string>
}

function newTraversalState(): EmailTraversalState {
  return { nodesVisited: 0, visited: new WeakSet(), out: [], seen: new Set() }
}

function pushCandidate(state: EmailTraversalState, raw: string): void {
  const trimmed = raw.trim()
  if (!trimmed) return
  const dedupeKey = trimmed.toLowerCase()
  if (state.seen.has(dedupeKey)) return
  state.seen.add(dedupeKey)
  state.out.push(trimmed)
}

/** Extracao regex de e-mail literal, analisando no maximo os primeiros RAW_JSON_MAX_STRING_LENGTH chars. */
function extractLiteralEmails(state: EmailTraversalState, text: string): void {
  const slice = text.length > RAW_JSON_MAX_STRING_LENGTH ? text.slice(0, RAW_JSON_MAX_STRING_LENGTH) : text
  const matches = slice.match(EMAIL_EXTRACT_RE)
  if (!matches) return
  for (const match of matches) pushCandidate(state, match)
}

/**
 * Traversal recursivo com limites HARD. Profundidade do no raiz = 0; nos com
 * `depth > RAW_JSON_MAX_DEPTH` nao sao visitados. Cada no visitado (objeto,
 * array, string ou primitivo) consome 1 do orcamento de nos.
 */
function traverseForEmails(value: unknown, depth: number, underEmailKey: boolean, state: EmailTraversalState): void {
  if (depth > RAW_JSON_MAX_DEPTH) return
  if (state.nodesVisited >= RAW_JSON_MAX_NODES) return
  state.nodesVisited += 1

  if (typeof value === 'string') {
    if (underEmailKey) {
      // Valor direto de chave *email*: candidato literal (validacao fica no prioritizer).
      pushCandidate(state, value.slice(0, RAW_JSON_MAX_STRING_LENGTH))
    } else {
      extractLiteralEmails(state, value)
    }
    return
  }

  if (Array.isArray(value)) {
    if (state.visited.has(value)) return
    state.visited.add(value)
    for (const item of value) {
      if (state.nodesVisited >= RAW_JSON_MAX_NODES) return
      traverseForEmails(item, depth + 1, underEmailKey, state)
    }
    return
  }

  if (value && typeof value === 'object') {
    if (state.visited.has(value)) return
    state.visited.add(value)
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (state.nodesVisited >= RAW_JSON_MAX_NODES) return
      // Denylist vence sempre — inclusive sobre chaves que tambem contem
      // 'email' (ex: personal_email) — e corta a subarvore inteira.
      if (isDenylistedKey(key)) continue
      traverseForEmails(child, depth + 1, isEmailKey(key), state)
    }
  }
}

/** Aplica o traversal recursivo (mesmos limites/denylist) a um JSON ja parseado. Nunca lanca. */
function collectEmailsFromParsedJson(parsed: unknown): string[] {
  const state = newTraversalState()
  try {
    traverseForEmails(parsed, 0, false, state)
  } catch {
    // Traversal nunca deve derrubar o enriquecimento; devolve o que coletou.
  }
  return state.out
}

/** href="mailto:..." (aspas opcionais; para em aspas, '>' ou espaco). */
const MAILTO_HREF_RE = /href\s*=\s*["']?\s*mailto:([^"'>\s]+)/gi

/** Blocos <script type="application/ld+json">...</script>. */
const JSON_LD_SCRIPT_RE = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

/**
 * Ofuscacoes simples APENAS (criterio 7 do doc): token 'at'/'arroba'/'dot'
 * exige delimitador explicito [colchete] ou (parentese) — 'look at example.com'
 * e 'olhe (at) casa' nunca viram e-mail. Espacos opcionais ao redor (sem
 * atravessar quebra de linha, para nao juntar trechos nao relacionados).
 */
const OBFUSCATED_AT_RE = /[ \t]*[[(]\s*(?:at|arroba)\s*[\])][ \t]*/gi
const OBFUSCATED_DOT_RE = /[ \t]*[[(]\s*dot\s*[\])][ \t]*/gi

/** Entidades HTML do arroba decodificadas antes do regex literal. */
const HTML_AT_ENTITY_RE = /&#0*64;|&commat;/gi

/**
 * Extrai todos os candidatos a email de um bloco de HTML/texto. Nunca lanca.
 *
 * Fontes cobertas: e-mail literal, links `mailto:` (URI decodificada, query
 * `?subject=` cortada), blocos JSON-LD (parse tolerante a falha + traversal
 * recursivo com os mesmos limites/denylist do rawJson) e ofuscacoes simples
 * com delimitador explicito. Falsos positivos de asset (loader@2x.gif) sao
 * rejeitados adiante pelo `prioritizeEmails` (regressao preservada).
 */
export function extractEmailCandidatesFromHtml(html: string | null | undefined): string[] {
  if (!html || typeof html !== 'string') return []
  try {
    const seen = new Set<string>()
    const out: string[] = []
    const push = (raw: string): void => {
      const clean = raw.trim().toLowerCase()
      if (!clean || seen.has(clean)) return
      seen.add(clean)
      out.push(clean)
    }

    const decoded = html.replace(HTML_AT_ENTITY_RE, '@')

    // Blocos JSON-LD sao processados SOMENTE pelo traversal estruturado
    // (que aplica a denylist de chaves pessoais). Removemos os blocos do
    // texto das demais passadas para que um owner.email dentro do JSON-LD
    // nao vaze pela extracao literal. Bloco com JSON invalido e descartado
    // por inteiro (fail-closed).
    const withoutJsonLd = decoded.replace(JSON_LD_SCRIPT_RE, ' ')

    // 1. E-mail literal no texto/atributos (comportamento original).
    for (const match of withoutJsonLd.match(EMAIL_EXTRACT_RE) ?? []) push(match)

    // 2. Links mailto: — corta a query string e decodifica a URI.
    for (const match of withoutJsonLd.matchAll(MAILTO_HREF_RE)) {
      const target = match[1].split('?')[0]
      let address = target
      try {
        address = decodeURIComponent(target)
      } catch {
        // URI malformada: mantem o valor cru (validacao fica no prioritizer).
      }
      // mailto: aceita multiplos destinatarios separados por virgula.
      for (const part of address.split(',')) push(part)
    }

    // 3. JSON-LD — JSON.parse tolerante a falha; bloco invalido e ignorado.
    for (const match of decoded.matchAll(JSON_LD_SCRIPT_RE)) {
      try {
        const parsed: unknown = JSON.parse(match[1])
        for (const candidate of collectEmailsFromParsedJson(parsed)) push(candidate)
      } catch {
        // Bloco JSON-LD invalido: segue para o proximo.
      }
    }

    // 4. Ofuscacoes simples com delimitador explicito.
    const deobfuscated = withoutJsonLd.replace(OBFUSCATED_AT_RE, '@').replace(OBFUSCATED_DOT_RE, '.')
    for (const match of deobfuscated.match(EMAIL_EXTRACT_RE) ?? []) push(match)

    return out
  } catch {
    return []
  }
}

/**
 * Coleta candidatos a email do rawJson do provider. Nunca lanca.
 *
 * Percorre objetos e arrays aninhados com limites HARD (profundidade 6,
 * 2000 nos, 10000 chars por string) e protecao contra ciclos. Chaves cujo
 * nome contem 'email' contribuem valor string/array direto; demais strings
 * passam por extracao regex de e-mail literal. Subarvores sob chaves da
 * denylist de PII (owner, personal, cpf, token, ...) nao sao percorridas.
 */
export function extractEmailsFromRawJson(rawJson: Record<string, unknown> | null | undefined): string[] {
  if (!rawJson || typeof rawJson !== 'object') return []
  return collectEmailsFromParsedJson(rawJson)
}

export interface EmailDiscoveryInput {
  /** Campos brutos do lead (Google Places, scraper, etc). */
  rawJson?: Record<string, unknown> | null
  /** HTML do site (se ja disponivel — p.ex. vindo do site-audit). */
  html?: string | null
  /** Candidatos adicionais colhidos ad-hoc (ex: CNPJ databases). */
  extra?: readonly string[]
  /**
   * Website canonico do lead (Lead.website). Quando presente e valido, a
   * ordenacao prioriza dominio canonico sobre externo (criterios 6-7 do doc).
   * Ausente/invalido: comportamento legado identico (regressao garantida).
   */
  websiteUrl?: string | null
}

export interface EmailDiscoveryResult extends PrioritizedEmails {
  /** Rotulos das fontes efetivamente utilizadas. */
  sources: string[]
  /** Classe de dominio do `primary` ('unknown' se primary null ou sem websiteUrl utilizavel). */
  primaryDomainClass: EmailDomainClass
}

/**
 * Orquestra a descoberta: coleta candidatos das fontes disponiveis e aplica
 * `prioritizeEmails` para selecionar o email primario segundo heuristica LGPD.
 *
 * Com `websiteUrl` valido, reordena os candidatos validados/deduplicados em
 * quatro grupos estaveis: canonical-generico > canonical-pessoal >
 * external-generico > external-pessoal. Assim `contato@plataforma.com`
 * (rodape de agencia) nunca vence `joao@empresa.com.br` quando o site do
 * lead e empresa.com.br.
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
  if (!prioritized.primary) {
    return { ...prioritized, sources, primaryDomainClass: 'unknown' }
  }

  // Lista validada/deduplicada na ordem LGPD legada (genericos > pessoais).
  const ordered = [prioritized.primary, ...prioritized.secondary]

  const websiteUrl = input.websiteUrl ?? null
  const probe = websiteUrl ? classifyEmailDomain(ordered[0], websiteUrl) : 'unknown'
  if (probe === 'unknown') {
    // Sem websiteUrl utilizavel: comportamento legado identico (regressao).
    return { ...prioritized, sources, primaryDomainClass: 'unknown' }
  }

  // Reordenacao por dominio canonico, estavel dentro de cada grupo.
  const canonicalGeneric: string[] = []
  const canonicalPersonal: string[] = []
  const externalGeneric: string[] = []
  const externalPersonal: string[] = []
  for (const email of ordered) {
    const canonical = classifyEmailDomain(email, websiteUrl) === 'canonical'
    const generic = isGenericEmail(email)
    if (canonical && generic) canonicalGeneric.push(email)
    else if (canonical) canonicalPersonal.push(email)
    else if (generic) externalGeneric.push(email)
    else externalPersonal.push(email)
  }

  const reordered = [...canonicalGeneric, ...canonicalPersonal, ...externalGeneric, ...externalPersonal]
  return {
    primary: reordered[0],
    secondary: reordered.slice(1),
    sources,
    primaryDomainClass: classifyEmailDomain(reordered[0], websiteUrl),
  }
}
