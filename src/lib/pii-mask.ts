/**
 * Mascaramento parcial de PII para exportacao de logs de erro de coleta.
 *
 * Contrato (Task B7 - tela de erros da coleta):
 * - email    -> `p***@dominio.com`
 * - telefone -> `(xx) ****-xx00`
 * - CPF      -> `***.***.***-XX`
 * - nome     -> primeiro nome + iniciais dos demais
 *
 * Mascaramento parcial (nao [REDACTED] total) para preservar utilidade do log
 * para o operador sem expor o dado completo. Reutilizavel por qualquer fluxo de
 * export que precise vazar logs com PII.
 */

const EMAIL_RE = /([\w.%+-])([\w.%+-]*)@([\w.-]+\.[A-Za-z]{2,})/g
// CPF: 11 digitos, com ou sem pontuacao.
const CPF_RE = /\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g
// Telefone BR: 10-11 digitos, com ou sem DDD/pontuacao.
const PHONE_RE = /(?:\+?55\s*)?\(?(\d{2})\)?[\s.-]?(\d{4,5})[\s.-]?(\d{4})\b/g

/** `joao@gmail.com` -> `j***@gmail.com` */
export function maskEmail(value: string): string {
  return value.replace(EMAIL_RE, (_m, first: string, _rest: string, domain: string) => `${first}***@${domain}`)
}

/** `123.456.789-09` -> `***.***.***-09` */
export function maskCpf(value: string): string {
  return value.replace(CPF_RE, (_m, _a, _b, _c, last: string) => `***.***.***-${last}`)
}

/** `(11) 98765-4321` -> `(11) ****-4321` */
export function maskPhone(value: string): string {
  return value.replace(PHONE_RE, (_m, ddd: string, _mid: string, last: string) => `(${ddd}) ****-${last}`)
}

/** `Maria Aparecida Silva` -> `Maria A. S.` */
export function maskName(value: string): string {
  const parts = value.trim().split(/\s+/)
  if (parts.length <= 1) return value
  const [first, ...rest] = parts
  return `${first} ${rest.map((p) => `${p.charAt(0).toUpperCase()}.`).join(' ')}`
}

/**
 * Aplica mascaramento parcial de email, CPF e telefone em texto livre.
 * Nomes nao sao detectaveis em texto livre sem NER, portanto `maskName` deve ser
 * chamado em campos estruturados conhecidos como nome.
 */
export function maskFreeText(value: string): string {
  return maskPhone(maskCpf(maskEmail(value)))
}

/**
 * Mascara recursivamente um valor JSON (string/array/objeto) aplicando
 * `maskFreeText` em todas as strings. Campos cujo nome sugere nome proprio
 * (`name`, `nome`, `fullName`, `contactName`) recebem tambem `maskName`.
 */
export function maskPiiDeep(value: unknown): unknown {
  if (typeof value === 'string') return maskFreeText(value)
  if (Array.isArray(value)) return value.map(maskPiiDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string' && /(^|_)(name|nome)$|fullname|contactname/i.test(k)) {
        out[k] = maskFreeText(maskName(v))
      } else {
        out[k] = maskPiiDeep(v)
      }
    }
    return out
  }
  return value
}
