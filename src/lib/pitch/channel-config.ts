/** Canais de um pitch template — o que faltava: diferenciar e-mail de WhatsApp. */
export const CHANNEL_OPTIONS = ['email', 'whatsapp', 'telefone'] as const
export type ChannelOption = (typeof CHANNEL_OPTIONS)[number]

export const CHANNEL_LABELS: Record<ChannelOption, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  telefone: 'Telefone (roteiro)',
}

export const CHANNEL_HINTS: Record<ChannelOption, string> = {
  email: 'E-mail com assunto + corpo. Texto mais completo; assine com seu nome e contato.',
  whatsapp: 'Mensagem curta (2-3 blocos, ~350-600 caracteres). Sem assunto, sem emoji no 1º contato, com saída fácil ("se não fizer sentido, me avisa").',
  telefone: 'Roteiro de ligação: abertura, observação, oferta e CTA de permissão.',
}
