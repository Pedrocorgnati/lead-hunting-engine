export const TONE_OPTIONS = ['formal', 'informal', 'tecnico'] as const
export type ToneOption = typeof TONE_OPTIONS[number]

export const TONE_DESCRIPTIONS: Record<ToneOption, string> = {
  formal: 'Tom profissional e respeitoso, focado em resultados de negócio',
  informal: 'Tom descontraído e próximo, como uma conversa entre parceiros',
  tecnico: 'Tom técnico com foco em soluções digitais específicas',
}

export const TONE_SYSTEM_PROMPTS: Record<ToneOption, string> = {
  formal: 'Você é um consultor de negócios sênior. Use linguagem formal e profissional.',
  informal: 'Você é um parceiro de negócios amigável. Use linguagem informal e direta.',
  tecnico: 'Você é um especialista em transformação digital. Use termos técnicos precisos.',
}
