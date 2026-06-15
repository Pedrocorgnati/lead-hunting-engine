/**
 * outreach-engine (brainstorm 06-10, task 12 — F-12): classificacao PURA de
 * resposta inbound -> outcome. Sem IO; testavel isoladamente.
 *
 * Categorias minimas do Aceite: `interessado`, `nao`, `encaminhado/
 * transferido`, `out of office` — mais opt-out (vai para supressao) e
 * AMBIGUOUS (revisao humana; nunca transicao automatica).
 *
 * Heuristica keyword pt-BR + en. Ordem de avaliacao IMPORTA:
 * opt-out > out-of-office > encaminhado > negativa > interesse — uma resposta
 * "nao tenho interesse, remova meu email" e opt-out, nao apenas negativa.
 */

export type InboundOutcome =
  | 'INTERESTED'
  | 'REJECTED'
  | 'FORWARDED'
  | 'OUT_OF_OFFICE'
  | 'OPT_OUT'
  | 'AMBIGUOUS'

export interface InboundClassification {
  outcome: InboundOutcome
  confidence: 'high' | 'low'
  matchedPattern?: string
}

const OPT_OUT_PATTERNS: RegExp[] = [
  /\b(descadastr\w+|remova\s+(meu|o)\s+(e-?mail|endereco|contato)|nao\s+(quero|desejo)\s+(mais\s+)?receber|pare\s+de\s+(me\s+)?enviar|unsubscribe|opt[ -]?out|remove\s+me\s+from)\b/i,
  /\b(spam|denunci\w+|procon|lgpd)\b/i,
]

const OUT_OF_OFFICE_PATTERNS: RegExp[] = [
  /\b(fora\s+do\s+escritorio|ausente\s+(ate|do\s+escritorio)|em\s+ferias|de\s+ferias|licenca|out\s+of\s+(the\s+)?office|automatic\s+reply|resposta\s+automatica|auto[ -]?reply|away\s+from|retorno\s+(em|dia|apos))\b/i,
]

const FORWARDED_PATTERNS: RegExp[] = [
  /\b(encaminh\w+|transferi\w*|repassei|repassand\w+|fale\s+com|entre\s+em\s+contato\s+com|responsavel\s+(por\s+isso\s+)?e|pessoa\s+(certa|indicada)\s+e|forward(ed|ing)?\s+(to|your)|contact\s+instead|nao\s+sou\s+(o|a)\s+responsavel)\b/i,
]

const REJECTED_PATTERNS: RegExp[] = [
  /\b(nao\s+(tenho|temos)\s+interesse|sem\s+interesse|nao\s+(estamos|estou)\s+interessad\w+|not\s+interested|no\s+interest|nao\s+precisamos?|ja\s+(temos|tenho)\s+(um\s+)?(fornecedor|site|sistema|parceiro)|nao\s+e\s+(o\s+)?momento|obrigad\w+,?\s+mas\s+nao)\b/i,
]

const INTERESTED_PATTERNS: RegExp[] = [
  /\b(tenho\s+interesse|interessad\w+|quero\s+(saber|conhecer|entender)\s+mais|gostaria\s+de\s+(saber|conversar|entender|agendar)|podemos\s+(conversar|marcar|agendar)|vamos\s+(conversar|marcar)|me\s+(liga|ligue|chama|chame)|qual\s+(o\s+)?(preco|valor|custo)|quanto\s+custa|manda\s+(mais|uma)\s+(detalhes|informacoes|proposta)|envie\s+(uma\s+)?proposta|interested|tell\s+me\s+more|sounds\s+(good|interesting)|let'?s\s+(talk|schedule)|agendar\s+(uma\s+)?(reuniao|call|conversa))\b/i,
]

function matchAny(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = p.exec(text)
    if (m) return m[0]
  }
  return null
}

export function classifyInboundReply(body: string, subject = ''): InboundClassification {
  const text = `${subject}\n${body}`.slice(0, 10_000)

  const optOut = matchAny(text, OPT_OUT_PATTERNS)
  if (optOut) return { outcome: 'OPT_OUT', confidence: 'high', matchedPattern: optOut }

  const ooo = matchAny(text, OUT_OF_OFFICE_PATTERNS)
  if (ooo) return { outcome: 'OUT_OF_OFFICE', confidence: 'high', matchedPattern: ooo }

  const forwarded = matchAny(text, FORWARDED_PATTERNS)
  if (forwarded) return { outcome: 'FORWARDED', confidence: 'low', matchedPattern: forwarded }

  const rejected = matchAny(text, REJECTED_PATTERNS)
  if (rejected) return { outcome: 'REJECTED', confidence: 'high', matchedPattern: rejected }

  const interested = matchAny(text, INTERESTED_PATTERNS)
  if (interested) return { outcome: 'INTERESTED', confidence: 'high', matchedPattern: interested }

  return { outcome: 'AMBIGUOUS', confidence: 'low' }
}

/** Bounce report (DSN) detectado no corpo/assunto? Trata como bounce, nao reply. */
export function looksLikeBounce(subject: string, body: string): boolean {
  return /\b(mail delivery (failed|subsystem)|undeliver(able|ed)|delivery status notification|returned mail|mailer-daemon|550|user unknown|mailbox (full|unavailable))\b/i.test(
    `${subject}\n${body}`.slice(0, 5000),
  )
}
