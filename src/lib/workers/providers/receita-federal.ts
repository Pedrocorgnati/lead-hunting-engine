import { kvGet, kvSet } from '@/lib/cache/kv-cache'

const BRASIL_API_BASE = 'https://brasilapi.com.br/api/cnpj/v1'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

export interface CnpjData {
  razaoSocial: string
  nomeFantasia: string | null
  situacao: string
  cnaePrincipal: { codigo: string; descricao: string } | null
  capital: number | null
  uf: string | null
  municipio: string | null
}

function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '')
}

function parseResponse(raw: Record<string, unknown>): CnpjData {
  const cnae = raw.cnae_fiscal_descricao
    ? { codigo: String(raw.cnae_fiscal ?? ''), descricao: String(raw.cnae_fiscal_descricao) }
    : null

  return {
    razaoSocial: String(raw.razao_social ?? ''),
    nomeFantasia: (raw.nome_fantasia as string | null) ?? null,
    situacao: String(raw.descricao_situacao_cadastral ?? raw.situacao_cadastral ?? 'DESCONHECIDA'),
    cnaePrincipal: cnae,
    capital: typeof raw.capital_social === 'number' ? raw.capital_social : null,
    uf: (raw.uf as string | null) ?? null,
    municipio: (raw.municipio as string | null) ?? null,
  }
}

export async function fetchCnpj(cnpj: string): Promise<CnpjData | null> {
  const clean = normalizeCnpj(cnpj)
  if (clean.length !== 14) return null

  const cacheKey = `cnpj:${clean}`

  const cached = await kvGet<CnpjData>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`${BRASIL_API_BASE}/${clean}`, {
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      console.warn(`[receita-federal] CNPJ ${clean} status ${res.status} — ignorando`)
      return null
    }

    const raw = await res.json() as Record<string, unknown>
    const data = parseResponse(raw)
    await kvSet(cacheKey, data, CACHE_TTL_MS)
    return data
  } catch (e) {
    // Falha nao bloqueia pipeline
    console.warn('[receita-federal] erro ao consultar:', (e as Error).message)
    return null
  }
}
