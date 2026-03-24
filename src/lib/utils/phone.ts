export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) {
    return `+${digits}`
  }
  if (digits.length >= 10 && digits.length <= 11) {
    return `+55${digits}`
  }
  return `+55${digits}`
}

export function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone)
  const digits = normalized.replace(/\D/g, '')
  if (digits.length === 13) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  if (digits.length === 12) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`
  }
  return phone
}
