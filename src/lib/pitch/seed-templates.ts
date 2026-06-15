/**
 * Conjunto canônico de pitch templates do SystemForge — DESIGN-FIRST.
 *
 * Baseados nos templates do app forge-outreach (mesma voz: Pedro Corgnati, dev
 * solo, value-first, com WhatsApp/portfólio), porém REESCRITOS para o público do
 * SystemForge (negócio LOCAL SEM site, contato COLD vindo do Google Maps) e
 * afinados em review de copy (Codex 06-11): observação factual em vez de
 * acusação, CTA de PERMISSÃO em vez de reunião, WhatsApp curto sem emoji com
 * saída fácil, sem nome de pessoa (não existe esse dado).
 *
 * Placeholders: ver template-vars.ts (lead: empresa/cidade/segmento/problema;
 * remetente: meu_nome/minha_empresa/meu_whatsapp/meu_portfolio).
 */
export interface SeedTemplate {
  name: string
  channel: 'email' | 'whatsapp' | 'telefone'
  tone: 'formal' | 'informal' | 'tecnico'
  subject?: string
  content: string
  isFavorite?: boolean
}

export const SEED_PITCH_TEMPLATES: SeedTemplate[] = [
  {
    name: 'E-mail — Sem site (presença digital)',
    channel: 'email',
    tone: 'informal',
    subject: '{{empresa}} no Google',
    isFavorite: true,
    content: [
      'Olá, pessoal da {{empresa}}.',
      '',
      'Encontrei vocês pesquisando por {{segmento}} em {{cidade}}. Vi que a {{empresa}} aparece no Google, mas notei uma coisa: {{problema}}.',
      '',
      'Isso costuma criar uma perda simples: a pessoa vê o perfil, quer entender serviços, horários ou chamar no WhatsApp, mas não encontra um caminho claro.',
      '',
      'Sou o {{meu_nome}}, desenvolvedor, e monto presença digital enxuta para negócios locais: site rápido, botão de WhatsApp, informações principais, agendamento quando faz sentido e ajustes no Google.',
      '',
      'Posso te mandar uma ideia objetiva de como isso ficaria para a {{empresa}}?',
      '',
      '{{meu_nome}} — {{minha_empresa}}',
      'WhatsApp: {{meu_whatsapp}} · Portfólio: {{meu_portfolio}}',
    ].join('\n'),
  },
  {
    name: 'E-mail — Agendamento / menos atrito',
    channel: 'email',
    tone: 'formal',
    subject: 'Agenda online para a {{empresa}}',
    content: [
      'Olá, equipe da {{empresa}}.',
      '',
      'Achei a {{empresa}} no Google procurando por {{segmento}} em {{cidade}}.',
      '',
      'Quando o cliente chega pelo Google, ele quer resolver rápido: ver serviços, tirar dúvida, chamar no WhatsApp ou agendar sem esperar resposta manual.',
      '',
      'Ajudo negócios locais a montar esse caminho: uma página simples, WhatsApp bem direcionado e, quando faz sentido, agendamento online — sem transformar o atendimento de vocês em robô impessoal.',
      '',
      'Se fizer sentido, posso te mandar um exemplo aplicado à {{empresa}}.',
      '',
      '{{meu_nome}} — {{minha_empresa}} · {{meu_whatsapp}}',
    ].join('\n'),
  },
  {
    name: 'E-mail — Além do Instagram',
    channel: 'email',
    tone: 'informal',
    subject: '{{empresa}}: além do Instagram',
    content: [
      'Oi, pessoal da {{empresa}}. Encontrei vocês pesquisando {{segmento}} em {{cidade}}.',
      '',
      'Vi que hoje o caminho principal é o Instagram. Ele ajuda, mas para quem vem do Google costuma faltar uma página direta com endereço, horários, serviços, botão de WhatsApp e agendamento — sem depender de postagem ou algoritmo.',
      '',
      'Monto isso de forma simples para negócios locais. Posso te mandar um exemplo aplicado à {{empresa}}?',
      '',
      '{{meu_nome}} — {{minha_empresa}} · {{meu_whatsapp}}',
    ].join('\n'),
  },
  {
    name: 'WhatsApp — Abertura (pede permissão)',
    channel: 'whatsapp',
    tone: 'informal',
    isFavorite: true,
    content: [
      'Oi, tudo bem? Falo com quem cuida da presença online da {{empresa}}?',
      '',
      'Sou o {{meu_nome}}. Encontrei vocês no Google procurando por {{segmento}} em {{cidade}} e notei que {{problema}}.',
      '',
      'Monto site simples com WhatsApp, informações e agendamento quando precisa. Posso te mandar uma ideia de como ficaria para a {{empresa}}?',
      '',
      'Se não fizer sentido, me avisa que não insisto.',
    ].join('\n'),
  },
  {
    name: 'WhatsApp — Prova / portfólio',
    channel: 'whatsapp',
    tone: 'informal',
    content: [
      'Oi, tudo bem? Sou o {{meu_nome}}, desenvolvedor.',
      '',
      'Vi a {{empresa}} no Google e reparei que {{problema}}. Trabalho criando presença digital para negócios locais: site rápido, WhatsApp organizado e página pronta para quem vem do Google.',
      '',
      'Tenho exemplos aqui: {{meu_portfolio}}',
      '',
      'Quer que eu te mande uma sugestão objetiva para a {{empresa}}?',
    ].join('\n'),
  },
  {
    name: 'Telefone — Roteiro de ligação',
    channel: 'telefone',
    tone: 'informal',
    content: [
      'Abertura: "Oi, é da {{empresa}}? Aqui é o {{meu_nome}}, desenvolvedor aqui da região. Achei vocês no Google — tem 1 minutinho?"',
      '',
      'Observação: "Vi que {{problema}}. Queria entender se é algo que vocês já pensaram em resolver."',
      '',
      'Oferta: "Eu monto site + WhatsApp + agendamento pra negócios locais como o de vocês."',
      '',
      'CTA: "Posso te mandar no WhatsApp uma ideia de como ficaria, sem compromisso?"',
    ].join('\n'),
  },
]

/** Nomes dos templates seed antigos (placeholders quebrados) a remover. */
export const LEGACY_TEMPLATE_NAMES = [
  'Proposta Site Institucional',
  'WhatsApp Direto — Casual',
  'Automação para Comércio',
]
