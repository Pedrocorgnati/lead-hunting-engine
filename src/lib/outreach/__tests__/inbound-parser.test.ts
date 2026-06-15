/**
 * outreach-engine (06-10, task 12): classificacao de resposta inbound.
 * Aceite: pelo menos `interessado`, `nao`, `encaminhado/transferido` e
 * `out of office` geram outcomes; ambiguo vai para revisao humana.
 */
import { classifyInboundReply, looksLikeBounce } from '../inbound-parser'

describe('classifyInboundReply', () => {
  it.each([
    ['tenho interesse, pode me ligar amanha?', 'INTERESTED'],
    ['Gostaria de saber mais sobre o servico. Quanto custa?', 'INTERESTED'],
    ['podemos conversar na quinta?', 'INTERESTED'],
  ])('interessado: "%s"', (text, expected) => {
    expect(classifyInboundReply(text).outcome).toBe(expected)
  })

  it.each([
    ['Nao tenho interesse, obrigado.', 'REJECTED'],
    ['ja temos um fornecedor de sites', 'REJECTED'],
    ['Not interested, thanks', 'REJECTED'],
  ])('negativa: "%s"', (text, expected) => {
    expect(classifyInboundReply(text).outcome).toBe(expected)
  })

  it.each([
    ['Encaminhei sua mensagem para o setor de marketing', 'FORWARDED'],
    ['fale com a Maria, ela e a responsavel', 'FORWARDED'],
    ['nao sou o responsavel por isso', 'FORWARDED'],
  ])('encaminhado/transferido: "%s"', (text, expected) => {
    expect(classifyInboundReply(text).outcome).toBe(expected)
  })

  it.each([
    ['Estou fora do escritorio ate dia 20', 'OUT_OF_OFFICE'],
    ['Automatic reply: out of office', 'OUT_OF_OFFICE'],
    ['Estou de ferias, retorno em julho', 'OUT_OF_OFFICE'],
  ])('out of office: "%s"', (text, expected) => {
    expect(classifyInboundReply(text).outcome).toBe(expected)
  })

  it('opt-out tem precedencia sobre negativa simples', () => {
    const result = classifyInboundReply('Nao tenho interesse. Remova meu email da lista.')
    expect(result.outcome).toBe('OPT_OUT')
  })

  it.each([
    ['unsubscribe', 'OPT_OUT'],
    ['pare de me enviar email', 'OPT_OUT'],
    ['vou denunciar como spam', 'OPT_OUT'],
  ])('opt-out: "%s"', (text, expected) => {
    expect(classifyInboundReply(text).outcome).toBe(expected)
  })

  it('texto sem sinal claro => AMBIGUOUS (revisao humana, nunca auto)', () => {
    const result = classifyInboundReply('ok')
    expect(result.outcome).toBe('AMBIGUOUS')
    expect(result.confidence).toBe('low')
  })
})

describe('looksLikeBounce', () => {
  it('detecta DSN classico', () => {
    expect(looksLikeBounce('Mail delivery failed', 'returning message to sender')).toBe(true)
    expect(looksLikeBounce('Undelivered Mail Returned to Sender', '550 user unknown')).toBe(true)
  })

  it('nao marca resposta humana como bounce', () => {
    expect(looksLikeBounce('Re: proposta', 'tenho interesse')).toBe(false)
  })
})
