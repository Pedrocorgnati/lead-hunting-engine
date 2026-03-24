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

export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const clean = url.trim()
  if (!clean.startsWith('http')) return `https://${clean}`
  return clean
}

const PII_KEYS = [
  'owner_name', 'ownerName', 'owner',
  'personal_email', 'personalEmail',
  'cpf', 'cnpj', 'rg',
  'birth_date', 'birthDate',
  'social_security', 'ssn',
]

export function sanitizeRawJson(rawJson: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...rawJson }
  for (const key of Object.keys(sanitized)) {
    if (PII_KEYS.some(pii => key.toLowerCase().includes(pii.toLowerCase()))) {
      sanitized[key] = '[PII_REMOVED]'
    }
  }
  return sanitized
}
