/**
 * outreach-engine (brainstorm 06-10, task 26 — F-26): A/B de pitch/sequencia.
 * Funcoes PURAS de selecao de vencedor por taxa de resposta com significancia
 * minima. O template vencedor SO e aplicado quando o criterio estatistico
 * configurado e atingido (amostra minima por variante + nivel de
 * significancia, persistidos em SystemConfig outreach.ab_testing e
 * ratificados pelo operador antes da 1a campanha A/B — Aceite task 26).
 */

export interface VariantStats {
  key: string
  sent: number
  replied: number
}

export interface AbDecision {
  decided: boolean
  winner: string | null
  reason: string
  variants: Array<{ key: string; sent: number; replied: number; rate: number }>
  pValue?: number
}

/** Erro-padrao da diferenca de proporcoes (aprox. normal). */
function zForTwoProportions(a: VariantStats, b: VariantStats): number | null {
  if (a.sent === 0 || b.sent === 0) return null
  const pa = a.replied / a.sent
  const pb = b.replied / b.sent
  const pPool = (a.replied + b.replied) / (a.sent + b.sent)
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.sent + 1 / b.sent))
  if (se === 0) return null
  return (pa - pb) / se
}

/** p-value bicaudal a partir de z (aprox. de erf por serie/abramowitz-stegun). */
function twoTailedP(z: number): number {
  const az = Math.abs(z)
  // Aproximacao da cauda normal (Zelen & Severo).
  const t = 1 / (1 + 0.2316419 * az)
  const d = 0.3989423 * Math.exp((-az * az) / 2)
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return 2 * p
}

export interface AbConfig {
  minSamplePerVariant: number
  significanceLevel: number
  /** Operador ratificou os parametros antes da 1a campanha? Sem isso, nao decide. */
  ratifiedBy?: string | null
}

/**
 * Decide o vencedor entre as variantes. So decide se: (a) parametros
 * ratificados, (b) toda variante tem >= minSamplePerVariant envios, (c) a
 * diferenca para a runner-up e estatisticamente significativa (p <= alpha).
 */
export function decideAbWinner(variants: VariantStats[], config: AbConfig): AbDecision {
  const enriched = variants.map((v) => ({
    key: v.key,
    sent: v.sent,
    replied: v.replied,
    rate: v.sent > 0 ? v.replied / v.sent : 0,
  }))

  if (!config.ratifiedBy) {
    return { decided: false, winner: null, reason: 'parametros de A/B nao ratificados pelo operador', variants: enriched }
  }
  if (variants.length < 2) {
    return { decided: false, winner: null, reason: 'menos de 2 variantes', variants: enriched }
  }
  const underSampled = variants.filter((v) => v.sent < config.minSamplePerVariant)
  if (underSampled.length > 0) {
    return {
      decided: false,
      winner: null,
      reason: `amostra insuficiente em ${underSampled.map((v) => v.key).join(', ')} (< ${config.minSamplePerVariant})`,
      variants: enriched,
    }
  }

  const sorted = [...enriched].sort((a, b) => b.rate - a.rate)
  const best = sorted[0]
  const runnerUp = sorted[1]
  const z = zForTwoProportions(
    { key: best.key, sent: best.sent, replied: best.replied },
    { key: runnerUp.key, sent: runnerUp.sent, replied: runnerUp.replied },
  )
  if (z === null) {
    return { decided: false, winner: null, reason: 'variancia insuficiente para teste', variants: enriched }
  }
  const pValue = twoTailedP(z)
  if (pValue <= config.significanceLevel) {
    return { decided: true, winner: best.key, reason: `vencedor ${best.key} (p=${pValue.toFixed(4)})`, variants: enriched, pValue }
  }
  return { decided: false, winner: null, reason: `diferenca nao significativa (p=${pValue.toFixed(4)} > ${config.significanceLevel})`, variants: enriched, pValue }
}
