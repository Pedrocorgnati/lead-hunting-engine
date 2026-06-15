/**
 * Classificador de telefone BR — feature aumentar e-mails/WhatsApp (blacksmith 06-11, Task 6).
 *
 * Funcao PURA, sem I/O. Classifica um telefone como celular BR ('mobile'),
 * fixo BR ('fixed') ou 'unknown'. O resultado alimenta a regra de nivel do
 * sinal WhatsApp (ver enrichment-data.ts): 'mobile' deriva nivel 'probable';
 * 'unknown' NUNCA gera nivel provavel — fail-closed por design.
 *
 * IMPORTANTE sobre o formato de entrada: normalizePhone (data-normalizer.ts)
 * so normaliza para '+55...' quando o numero tem 11 ou 13 digitos. Fixos de
 * 10 digitos e demais formatos passam crus para Lead.phone. Por isso o parser
 * aqui aceita formatos variados: '+5511999998888', '5511999998888',
 * '(11) 99999-8888', '011999998888'.
 *
 * NOTA — classificadores paralelos (review 06-11 R3-7): existe um modulo
 * IRMAO em `src/lib/outreach/phone-utils.ts` (frente de outreach) com um
 * `isMobileBR` proprio que NAO valida DDD — ele e deliberadamente permissivo
 * porque so precisa formatar numeros para link wa.me. Este modulo valida o
 * DDD contra VALID_BR_DDDS e e fail-closed justamente porque alimenta o nivel
 * 'probable' do sinal WhatsApp (falso 'mobile' viraria sinal indevido).
 * Consolidacao futura deve eleger ESTE modulo como canonico para
 * CLASSIFICACAO; o de outreach segue como utilitario de formatacao.
 */

export type BRPhoneClass = 'mobile' | 'fixed' | 'unknown'

/**
 * Tabela de DDDs validos do plano de numeracao BR (ANATEL).
 * Embutida como const para manter o modulo puro e sem dependencias.
 */
export const VALID_BR_DDDS: ReadonlySet<string> = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
])

/**
 * Classifica um telefone BR:
 *  - 'mobile':  DDD valido + assinante de 9 digitos iniciando em 9;
 *  - 'fixed':   DDD valido + assinante de 8 digitos iniciando em 2-5;
 *  - 'unknown': numero nao-BR (nao da pra afirmar +55), DDD invalido,
 *               comprimento fora do padrao, celular legado de 8 digitos
 *               (sem o nono digito), entrada nula/vazia/nao numerica.
 *
 * Parsing: strip de nao-digitos; remocao de '0' de tronco inicial; remocao
 * do prefixo '55' quando o total tem 12-13 digitos (codigo do pais).
 */
export function classifyBRPhone(phone: string | null | undefined): BRPhoneClass {
  if (!phone) return 'unknown'

  // Strip de tudo que nao e digito ('+', espacos, parenteses, hifens).
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 0) return 'unknown'

  // Remove '0' de tronco inicial (discagem nacional: 011 99999-8888).
  digits = digits.replace(/^0+/, '')

  // Remove codigo do pais '55' quando o comprimento total e 12-13 digitos
  // (10-11 digitos nacionais + '55'). Fora dessa faixa nao da pra afirmar
  // que o '55' inicial e codigo do pais (poderia ser o DDD 55).
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2)
  }

  // Apos a normalizacao, so 10 (fixo) ou 11 (celular) digitos sao BR validos.
  if (digits.length !== 10 && digits.length !== 11) return 'unknown'

  const ddd = digits.slice(0, 2)
  if (!VALID_BR_DDDS.has(ddd)) return 'unknown'

  const subscriber = digits.slice(2)

  // Celular: assinante de 9 digitos iniciando em 9.
  if (subscriber.length === 9 && subscriber.startsWith('9')) return 'mobile'

  // Fixo: assinante de 8 digitos iniciando em 2-5.
  if (subscriber.length === 8 && /^[2-5]/.test(subscriber)) return 'fixed'

  // Sobram casos ambiguos (ex.: celular legado de 8 digitos iniciando em
  // 6-9, assinante de 9 digitos que nao comeca em 9): unknown.
  return 'unknown'
}

/** true somente quando classifyBRPhone retorna 'mobile'. */
export function isMobileBR(phone: string | null | undefined): boolean {
  return classifyBRPhone(phone) === 'mobile'
}
