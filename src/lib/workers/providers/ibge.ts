import { kvGet, kvSet } from '@/lib/cache/kv-cache'

/**
 * IBGE Provider — dados regionais (municipios) via API publica do IBGE.
 * Endpoint: https://servicodados.ibge.gov.br/api/v1/localidades/municipios
 *
 * API aberta, sem chave. Dados cacheados por 30 dias (municipios mudam raramente).
 */

const IBGE_BASE = process.env.IBGE_API_BASE ?? 'https://servicodados.ibge.gov.br/api/v1'
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 dias

export interface IbgeMunicipio {
  id: number
  nome: string
  uf: string | null
  ufSigla: string | null
  regiao: string | null
  regiaoId: number | null
}

export interface IbgeMunicipioRaw {
  id: number
  nome: string
  microrregiao?: {
    mesorregiao?: {
      UF?: {
        id: number
        sigla: string
        nome: string
        regiao?: { id: number; sigla: string; nome: string }
      }
    }
  }
}

function normalize(raw: IbgeMunicipioRaw): IbgeMunicipio {
  const uf = raw.microrregiao?.mesorregiao?.UF
  return {
    id: raw.id,
    nome: raw.nome,
    uf: uf?.nome ?? null,
    ufSigla: uf?.sigla ?? null,
    regiao: uf?.regiao?.nome ?? null,
    regiaoId: uf?.regiao?.id ?? null,
  }
}

/**
 * Busca dados de um municipio por nome (case-insensitive).
 * Retorna o primeiro match ou null.
 */
export async function fetchIbgeMunicipio(nome: string): Promise<IbgeMunicipio | null> {
  const query = nome.trim().toLowerCase()
  if (!query) return null

  const cacheKey = `ibge:municipio:${query}`
  const cached = await kvGet<IbgeMunicipio>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`${IBGE_BASE}/localidades/municipios`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.warn(`[ibge] status ${res.status}`)
      return null
    }
    const all = await res.json() as IbgeMunicipioRaw[]
    const match = all.find((m) => m.nome.toLowerCase() === query)
      ?? all.find((m) => m.nome.toLowerCase().includes(query))
    if (!match) return null
    const data = normalize(match)
    await kvSet(cacheKey, data, CACHE_TTL_MS)
    return data
  } catch (e) {
    console.warn('[ibge] erro:', (e as Error).message)
    return null
  }
}

/**
 * Lista todos os municipios de uma UF (sigla, ex: 'SP').
 */
export async function fetchIbgeMunicipiosByUf(ufSigla: string): Promise<IbgeMunicipio[]> {
  const uf = ufSigla.trim().toUpperCase()
  if (!uf) return []
  const cacheKey = `ibge:uf:${uf}`
  const cached = await kvGet<IbgeMunicipio[]>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`${IBGE_BASE}/localidades/estados/${uf}/municipios`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.warn(`[ibge] uf ${uf} status ${res.status}`)
      return []
    }
    const raw = await res.json() as IbgeMunicipioRaw[]
    const data = raw.map(normalize)
    await kvSet(cacheKey, data, CACHE_TTL_MS)
    return data
  } catch (e) {
    console.warn('[ibge] erro uf:', (e as Error).message)
    return []
  }
}
