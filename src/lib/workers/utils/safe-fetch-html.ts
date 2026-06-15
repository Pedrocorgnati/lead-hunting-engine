/**
 * src/lib/workers/utils/safe-fetch-html.ts
 *
 * Fetch SSRF-safe de paginas HTML — utilitario extraido de
 * `scripts/backfill-lead-emails.ts` para reuso pelo worker de descoberta
 * de e-mail (doc 06-11-aumentar-emails-lead-hunting, criterios 9/11 de §12;
 * passo 8 de §15).
 *
 * Modelo de ameaca: a URL vem do `website` do lead, ou seja, e INPUT NAO
 * CONFIAVEL — pode apontar para rede interna, loopback, link-local/metadata
 * de cloud (169.254.169.254), CGNAT, multicast, etc. Por isso:
 *   - so http/https;
 *   - resolve DNS UMA vez, seleciona um IPv4 PUBLICO e PINA esse IP na conexao
 *     TCP (review 06-11 R2-1): a requisicao e feita via node:http/node:https
 *     com `host` = IP pre-validado, header `Host` original e SNI/`servername`
 *     do hostname original — o transporte NAO re-resolve DNS, fechando a
 *     janela de rebinding TOCTOU em que um dominio com TTL 0 devolvia IP
 *     publico na validacao e 127.0.0.1 / 169.254.169.254 no connect do fetch.
 *     Com o pin, registros extras do host (AAAA, mix malicioso) nunca sao
 *     usados — ver politica dual-stack em resolvePinnedIp (E2E 06-12);
 *   - IPv6 conservador: a conexao nunca usa IPv6 (host IPv6-only e rejeitado;
 *     o fluxo de descoberta nao precisa de IPv6);
 *   - redirects seguidos manualmente, re-resolvendo e re-pinando o host a
 *     cada hop (maximo `maxRedirects`);
 *   - timeout por requisicao (cada hop tem o proprio deadline, cobrindo
 *     conexao + headers + corpo) e apenas content-type text/html ou
 *     application/xhtml e aceito.
 *
 * Truncamento: o corpo e lido em streaming ate `maxBytes`; ao estourar o
 * limite, o chunk excedente e descartado e o PARCIAL acumulado e retornado
 * (suficiente para extrair e-mails do topo da pagina sem baixar payloads
 * arbitrariamente grandes).
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpRequest } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'

const DEFAULT_TIMEOUT_MS = 7_000
const DEFAULT_MAX_BYTES = 1_500_000
const DEFAULT_MAX_REDIRECTS = 3
const DEFAULT_USER_AGENT = 'LeadHuntingEngine-EmailDiscovery/1.0'

export interface SafeFetchHtmlOptions {
  /** Timeout por requisicao em ms (cada hop de redirect tem o proprio). */
  timeoutMs?: number
  /** Limite de bytes do corpo; acima disso retorna o parcial acumulado. */
  maxBytes?: number
  /** Maximo de redirects seguidos (cada hop revalida e re-pina o host). */
  maxRedirects?: number
  /** User-Agent enviado na requisicao. */
  userAgent?: string
}

function ipv4ToInt(ip: string): number | null {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]
}

/** Bloqueia loopback, privado, link-local (metadata 169.254.169.254), CGNAT, etc. */
export function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip)
  if (fam === 4) {
    const n = ipv4ToInt(ip)
    if (n === null) return true
    const inRange = (base: string, bits: number) => {
      const b = ipv4ToInt(base)!
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
      return (n & mask) === (b & mask)
    }
    return (
      inRange('0.0.0.0', 8) || inRange('10.0.0.0', 8) || inRange('100.64.0.0', 10) ||
      inRange('127.0.0.0', 8) || inRange('169.254.0.0', 16) || inRange('172.16.0.0', 12) ||
      inRange('192.0.0.0', 24) || inRange('192.168.0.0', 16) || inRange('198.18.0.0', 15) ||
      inRange('224.0.0.0', 4) || inRange('240.0.0.0', 4)
    )
  }
  if (fam === 6) {
    const lo = ip.toLowerCase()
    if (lo === '::1' || lo === '::') return true
    if (lo.startsWith('fe80') || lo.startsWith('fc') || lo.startsWith('fd')) return true
    // IPv4-mapped (::ffff:a.b.c.d)
    const m = lo.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (m) return isBlockedIp(m[1])
    return true // demais IPv6 publicos: bloqueio conservador para o experimento
  }
  return true
}

/**
 * Resolve DNS do hostname UMA vez e retorna o IP a ser PINADO na conexao
 * (null = host inseguro). E este IP — e somente ele — que a requisicao usa no
 * connect; validar e depois deixar o fetch re-resolver seria exatamente o
 * TOCTOU do R2-1.
 *
 * Politica dual-stack (E2E 06-12): como o connect e PINADO, o que importa e a
 * seguranca do IP efetivamente usado — nao a pureza do conjunto inteiro de
 * registros. A regra anterior ("todos os registros publicos", herdada do
 * experimento pre-pinning, quando o fetch podia re-resolver qualquer registro)
 * derrubava todo host dual-stack (AAAA publico e bloqueado conservadoramente),
 * o que na pratica rejeitou 7/9 sites reais de leads. Regra atual: escolhe o
 * PRIMEIRO IPv4 publico e conecta exatamente nele; registros extras (AAAA ou
 * IPv4 privado misturado por atacante) sao irrelevantes porque nunca sao
 * usados. Sem IPv4 publico (host IPv6-only ou so registros bloqueados) =>
 * inseguro.
 */
export async function resolvePinnedIp(hostname: string): Promise<string | null> {
  if (isIP(hostname)) return isBlockedIp(hostname) ? null : hostname
  try {
    const records = await lookup(hostname, { all: true })
    if (records.length === 0) return null
    const candidate = records.find((r) => r.family === 4 && !isBlockedIp(r.address))
    return candidate?.address ?? null
  } catch {
    return null
  }
}

/** True quando o hostname resolve para ao menos um IPv4 publico pinavel. */
export async function hostIsSafe(hostname: string): Promise<boolean> {
  return (await resolvePinnedIp(hostname)) !== null
}

/**
 * Executa UM hop GET conectando DIRETO no IP pinado (sem re-resolucao DNS):
 *  - `host` da conexao = IP pre-validado;
 *  - header `Host` = host original da URL (virtual hosting preservado);
 *  - HTTPS: `servername` = hostname original (SNI + validacao de certificado
 *    contra o dominio, nao contra o IP).
 * O deadline `timeoutMs` cobre conexao + headers + corpo: ao estourar, a
 * requisicao e destruida (a leitura do corpo resolve com null/parcial).
 */
function requestPinned(
  url: URL,
  pinnedIp: string,
  opts: { timeoutMs: number; userAgent: string },
): Promise<{ res: IncomingMessage; clearDeadline: () => void } | null> {
  return new Promise((resolve) => {
    const isHttps = url.protocol === 'https:'
    const doRequest = isHttps ? httpsRequest : httpRequest
    let settled = false
    let clearDeadline = () => {}
    try {
      const req = doRequest(
        {
          host: pinnedIp,
          port: url.port ? Number(url.port) : isHttps ? 443 : 80,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers: { Host: url.host, 'User-Agent': opts.userAgent, Accept: 'text/html' },
          ...(isHttps ? { servername: url.hostname } : {}),
        },
        (res) => {
          if (settled) return
          settled = true
          resolve({ res, clearDeadline })
        },
      )
      const deadline = setTimeout(() => {
        req.destroy(new Error('safe-fetch-html: timeout'))
      }, opts.timeoutMs)
      deadline.unref?.()
      clearDeadline = () => clearTimeout(deadline)
      req.on('error', () => {
        clearDeadline()
        if (settled) return
        settled = true
        resolve(null)
      })
      req.end()
    } catch {
      if (!settled) {
        settled = true
        resolve(null)
      }
    }
  })
}

/**
 * Le o corpo em streaming ate `maxBytes`. Excedeu: descarta o chunk e retorna
 * o PARCIAL acumulado. Erro/abort no meio do corpo: retorna null (sem como
 * confiar no que veio). Nunca rejeita.
 *
 * Review 06-11 R2-6: o processamento de cada chunk (e o concat final) roda
 * DENTRO de try/catch — uma excecao no meio do streaming viraria throw dentro
 * do emit do stream (uncaught) em vez de respeitar o contrato "nunca lanca"
 * do modulo. Pego: settle(null) + destroy do response best-effort.
 */
function readBodyTruncated(res: IncomingMessage, maxBytes: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    let received = 0
    const chunks: Buffer[] = []
    const settle = (value: string | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const failNull = () => {
      settle(null)
      try {
        res.destroy()
      } catch {
        // destroy best-effort: o null ja foi settled acima
      }
    }
    res.on('data', (chunk: Buffer) => {
      try {
        received += chunk.length
        if (received > maxBytes) {
          settle(Buffer.concat(chunks).toString('utf8'))
          res.destroy()
          return
        }
        chunks.push(chunk)
      } catch {
        failNull()
      }
    })
    res.on('end', () => {
      try {
        settle(Buffer.concat(chunks).toString('utf8'))
      } catch {
        failNull()
      }
    })
    res.on('error', () => settle(null))
    res.on('aborted', () => settle(null))
  })
}

/** Fetch SSRF-safe com IP pinado e redirect manual validado. Retorna HTML (possivelmente truncado) ou null. */
export async function safeFetchHtml(
  rawUrl: string,
  opts: SafeFetchHtmlOptions = {}
): Promise<string | null> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    userAgent = DEFAULT_USER_AGENT,
  } = opts
  let url: URL
  try {
    url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
  } catch {
    return null
  }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // Resolve + valida + PINA: cada hop (inclusive redirects) conecta apenas
    // no IP que acabou de passar pela validacao — sem segunda resolucao.
    const pinnedIp = await resolvePinnedIp(url.hostname)
    if (!pinnedIp) return null
    const hit = await requestPinned(url, pinnedIp, { timeoutMs, userAgent })
    if (!hit) return null
    const { res, clearDeadline } = hit
    const status = res.statusCode ?? 0
    if (status >= 300 && status < 400) {
      const loc = res.headers.location
      res.resume() // drena o corpo do redirect sem acumular
      clearDeadline()
      if (!loc) return null
      try { url = new URL(loc, url) } catch { return null }
      continue
    }
    const ct = res.headers['content-type'] ?? ''
    if (!/text\/html|application\/xhtml/i.test(ct)) {
      res.destroy()
      clearDeadline()
      return null
    }
    // R2-6: cinto de seguranca redundante — mesmo que a leitura do corpo
    // rejeite por um caminho imprevisto, o contrato do modulo (nunca lancar)
    // e mantido: cancela o response best-effort e devolve null.
    let body: string | null
    try {
      body = await readBodyTruncated(res, maxBytes)
    } catch {
      try {
        res.destroy()
      } catch {
        // best-effort
      }
      body = null
    }
    clearDeadline()
    return body
  }
  return null
}
