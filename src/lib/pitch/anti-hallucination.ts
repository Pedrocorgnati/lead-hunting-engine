import type { LeadContext } from './prompt-builder'

export interface ValidationResult {
  valid: boolean
  issues: string[]
}

export function validatePitch(pitch: string, lead: LeadContext): ValidationResult {
  const issues: string[] = []

  // Verificar se pitch não inventa dados ausentes
  if (
    !lead.website &&
    pitch.toLowerCase().includes('seu site') &&
    pitch.toLowerCase().includes('http')
  ) {
    issues.push('Pitch menciona URL de site que não existe nos dados')
  }

  if (
    !lead.phone &&
    /\(\d{2}\)\s*\d{4,5}[-\s]\d{4}/.test(pitch)
  ) {
    issues.push('Pitch menciona número de telefone não encontrado nos dados')
  }

  // Verificar tamanho (max 200 palavras)
  const wordCount = pitch.split(/\s+/).filter(Boolean).length
  if (wordCount > 200) {
    issues.push(`Pitch muito longo: ${wordCount} palavras (máx: 200)`)
  }

  // Verificar se tem call-to-action
  const ctaPatterns = ['agendar', 'ligar', 'conversar', 'marcar', 'contato', 'falar']
  if (!ctaPatterns.some((p) => pitch.toLowerCase().includes(p))) {
    issues.push('Pitch sem call-to-action claro')
  }

  return { valid: issues.length === 0, issues }
}
