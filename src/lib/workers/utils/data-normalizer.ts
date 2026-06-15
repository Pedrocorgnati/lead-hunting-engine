import { toE164 } from '@/lib/outreach/phone-utils'

export interface RawLeadInput {
  externalId: string
  name: string
  address?: string | null
  city?: string | null
  state?: string | null
  phone?: string | null
  website?: string | null
  category?: string | null
  rating?: number | null
  reviewCount?: number | null
  lat?: number | null
  lng?: number | null
  openNow?: boolean | null
  priceLevel?: number | null
  siteReachable?: boolean | null
  siteHasSsl?: boolean | null
  siteMobileFriendly?: boolean | null
  instagramFollowers?: number | null
  instagramLastPostAt?: Date | null
  instagramPostFrequency?: number | null
  facebookFollowers?: number | null
  facebookLastPostAt?: Date | null
  facebookEngagementRate?: number | null
  facebookAbandoned?: boolean | null
  source: string
  rawJson: Record<string, unknown>
}

export function normalizeRawLead(input: RawLeadInput): RawLeadInput {
  return {
    ...input,
    name: input.name?.trim() ?? '',
    phone: normalizePhone(input.phone),
    website: normalizeUrl(input.website),
    rating: input.rating != null ? Math.round(input.rating * 10) / 10 : null,
  }
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return `+55${digits}`
  if (digits.length === 13 && digits.startsWith('55')) return `+${digits}`
  return phone.trim()
}

/**
 * Normalizador E.164 REAL para a coluna Lead.phoneNormalized ('+55...').
 * Diferente de normalizePhone (que devolve trim cru para fixos de 10 digitos,
 * violando o contrato da coluna — review 06-11 F2/R3-2), delega para toE164
 * (phone-utils), que cobre fixo de 10 digitos, tronco '0' e '00' internacional.
 * Retorna null quando nao da para formar um numero plausivel.
 */
export function normalizePhoneE164(phone: string | null | undefined): string | null {
  const e164 = toE164(phone)
  return e164 ? `+${e164}` : null
}

export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const clean = url.trim()
  if (!clean.startsWith('http')) return `https://${clean}`
  return clean
}

// Review 06-11 R2-2 (LGPD): o dominio de dados e pt-BR — a lista English-only
// deixava vazar PII de proprietario/socio ('proprietario', 'email_pessoal').
// Tokens pt-BR espelham SENSITIVE_KEY_DENYLIST de email-discovery.ts; o match
// normaliza diacriticos para cobrir 'proprietário'/'sócio' vindos de provider.
const PII_KEYS = [
  'owner_name', 'ownerName', 'owner',
  'personal_email', 'personalEmail',
  'cpf', 'cnpj', 'rg',
  'birth_date', 'birthDate',
  'social_security', 'ssn',
  'proprietario', 'dono', 'socio', 'responsavel',
  'titular', 'pessoal', 'nascimento', 'celular',
]

/** Lowercase + NFD sem diacriticos — 'Proprietário' e 'proprietario' casam igual. */
function normalizeKeyForMatch(key: string): string {
  return key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function isPiiKey(key: string): boolean {
  const k = normalizeKeyForMatch(key)
  return PII_KEYS.some((pii) => k.includes(normalizeKeyForMatch(pii)))
}

// Recursivo: PII pode estar aninhado (ex.: rawJson._pii_test_payload.owner_email).
// O sanitizador antigo so olhava chaves de topo, vazando PII de subobjetos para
// o banco (risco LGPD). Recorre em objetos e arrays; redige pelo NOME da chave.
function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isPiiKey(k) ? '[PII_REMOVED]' : sanitizeValue(v)
    }
    return out
  }
  return value
}

export function sanitizeRawJson(rawJson: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(rawJson) as Record<string, unknown>
}
