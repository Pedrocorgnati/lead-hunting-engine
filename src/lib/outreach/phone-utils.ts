/**
 * phone-utils — normalização E.164 e classificação móvel/fixo (foco BR), além
 * dos links de contato direto (wa.me / tel:). Função PURA (sem banco, testável).
 *
 * Contexto: o canal certo para o ICP (negócio sem site) é WhatsApp/telefone. O
 * `wa.me` exige o número em E.164 SÓ-DÍGITOS (ex.: `5512991234567`), e o botão
 * de WhatsApp só faz sentido para MÓVEL (fixo não tem WhatsApp).
 *
 * Regras BR (Anatel): E.164 = 55 + DDD(2) + assinante. Móvel = assinante de 9
 * dígitos começando em 9 (total 13). Fixo = assinante de 8 dígitos (total 12).
 */

/**
 * Normaliza um telefone para E.164 só-dígitos. Assume BR (`55`) quando não há
 * código de país. Retorna `null` se não conseguir formar um número plausível.
 */
export function toE164(phone: string | null | undefined, defaultCountry = '55'): string | null {
  if (!phone) return null
  let d = phone.replace(/\D/g, '')
  if (!d) return null
  // prefixo internacional discado (00) -> remove
  if (d.startsWith('00')) d = d.slice(2)
  // tronco nacional com 0 (ex.: 011 99999-9999) -> remove o 0 inicial
  if (d.length >= 11 && d.startsWith('0')) d = d.replace(/^0+/, '')
  // nacional BR sem código de país (DDD + assinante = 10 ou 11 dígitos)
  if (d.length === 10 || d.length === 11) d = defaultCountry + d
  // BR bem-formado
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d
  // outros países: aceita E.164 plausível como veio
  if (d.length >= 11 && d.length <= 15) return d
  return null
}

/** True se o E.164 é um celular brasileiro (DDD + 9 dígitos começando em 9). */
export function isMobileBR(e164: string | null | undefined): boolean {
  if (!e164) return false
  if (!e164.startsWith('55')) return false
  const local = e164.slice(2) // DDD(2) + assinante
  return local.length === 11 && local[2] === '9'
}

/** Conveniência: normaliza e classifica num passo. */
export function classifyPhone(phone: string | null | undefined): {
  e164: string | null
  isMobile: boolean
} {
  const e164 = toE164(phone)
  return { e164, isMobile: isMobileBR(e164) }
}

/** Link click-to-chat do WhatsApp com mensagem pré-preenchida. `null` se inválido. */
export function buildWaMeLink(phone: string | null | undefined, text?: string): string | null {
  const e164 = toE164(phone)
  if (!e164 || !isMobileBR(e164)) return null
  const q = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${e164}${q}`
}

/** Link de discagem. `null` se não normalizar. */
export function buildTelLink(phone: string | null | undefined): string | null {
  const e164 = toE164(phone)
  return e164 ? `tel:+${e164}` : null
}

/** Formata para exibição BR amigável: +55 (12) 99123-4567 / +55 (12) 3145-2031. */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  const e164 = toE164(phone)
  if (!e164 || !e164.startsWith('55') || (e164.length !== 12 && e164.length !== 13)) {
    return e164 ? `+${e164}` : (phone ?? '')
  }
  const ddd = e164.slice(2, 4)
  const sub = e164.slice(4)
  const mid = sub.length === 9 ? `${sub.slice(0, 5)}-${sub.slice(5)}` : `${sub.slice(0, 4)}-${sub.slice(4)}`
  return `+55 (${ddd}) ${mid}`
}
