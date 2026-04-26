import { logApiUsage } from '@/lib/observability/api-usage-logger'
import { getApiKey } from '../utils/get-credential'
import { GooglePlacesProvider } from './google-places'
import { OutscraperProvider } from './outscraper'
import { ApifyProvider } from './apify'
import { InstagramGraphProvider } from './instagram-graph'
import { InstagramApifyProvider } from './instagram-apify'
import { InstagramPhantomBusterProvider } from './instagram-phantombuster'
import { FacebookGraphProvider } from './facebook-graph'
import { FacebookIntermediaryProvider } from './facebook-intermediary'
import { GoogleMapsStrategy } from './strategies/google-maps-headless'
import { YelpStrategy } from './strategies/yelp-headless'
import { ApontadorStrategy } from './strategies/apontador-headless'
import { GuiaMaisStrategy } from './strategies/guiamais-headless'
import { LinkedInCompaniesProvider } from './linkedin-companies'
import { tryYelpApi } from './directories'
import { isHeadlessEnabled } from './anti-bot'
import type { BusinessSearchParams, BusinessResult, SocialSearchParams, SocialProfileData, SocialProvider } from './types'
import { queryReclameAqui } from './reclame-aqui'
import { querySintegra } from './sintegra'
import { queryTripAdvisor } from './tripadvisor'
import { fetchIbgeMunicipio } from './ibge'
import { fetchGmb } from './google-my-business'

const PROVIDER_ORDER = [GooglePlacesProvider, OutscraperProvider, ApifyProvider]

type HeadlessTier = 'OFFICIAL_API' | 'INTERMEDIARY' | 'HEADLESS'

// Social provider hierarchy: primary → fallback (IG: Graph -> Apify -> PhantomBuster)
const SOCIAL_PROVIDERS: Record<string, SocialProvider[]> = {
  INSTAGRAM: [InstagramGraphProvider, InstagramApifyProvider, InstagramPhantomBusterProvider],
  FACEBOOK: [FacebookGraphProvider, FacebookIntermediaryProvider],
}

const SOCIAL_CRED_MAP: Record<string, string[]> = {
  INSTAGRAM: ['instagram-graph', 'apify', 'phantombuster'],
  FACEBOOK:  ['facebook-graph',  'apify'],
}

/**
 * Lancado quando TODOS os providers em `SOCIAL_PROVIDERS[source]` falham
 * ou estao sem credencial. Capturado pelo job que chamou `collectSocial`
 * para decidir se reprocessa ou marca lead como `enrichmentStatus=PENDING`.
 */
export class AllProvidersExhausted extends Error {
  constructor(
    public readonly source: string,
    public readonly attempts: Array<{ provider: string; error: string }>,
  ) {
    super(
      `AllProvidersExhausted(${source}): ${attempts
        .map(a => `${a.provider}=${a.error}`)
        .join(' | ')}`,
    )
    this.name = 'AllProvidersExhausted'
  }
}

// ─── Honeypot Detection (BLOQUEADOR-SEC-01) ────────────────────────────────

function hasSequentialOrRepeatedDigits(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return true
  if (/^(\d)\1+$/.test(digits)) return true // all same digit: 0000000000
  let ascending = true
  let descending = true
  for (let i = 1; i < digits.length; i++) {
    if (parseInt(digits[i]) - parseInt(digits[i - 1]) !== 1) ascending = false
    if (parseInt(digits[i - 1]) - parseInt(digits[i]) !== 1) descending = false
  }
  return ascending || descending
}

/**
 * Detecta listings honeypot — resultados falsos injetados por provedores externos
 * para identificar scrapers. Filtra antes de persistir no banco (SEC-012).
 */
function isHoneypot(result: BusinessResult): boolean {
  // Sem nome → definitivamente inválido
  if (!result.name || result.name.trim() === '') return true
  // Nome com padrões suspeitos
  if (/\b(test|fake|honeypot|example|dummy|lorem|placeholder|sample)\b/i.test(result.name)) return true
  // Sem endereço E sem telefone → dados insuficientes para lead real
  if (!result.address && !result.phone) return true
  // Telefone com dígitos sequenciais ou repetidos
  if (result.phone && hasSequentialOrRepeatedDigits(result.phone)) return true
  return false
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * Executa busca em cascata: Google Places → Outscraper → Apify.
 * Cada provider é tentado em ordem; se sem credencial ou sem resultados, tenta o próximo.
 * Se todos falharem, lança erro agregado com motivos de cada falha (SYS_001).
 * Nunca expõe a chave de API nas mensagens de erro (SEC-012).
 */
export async function searchBusinesses(params: BusinessSearchParams): Promise<BusinessResult[]> {
  const errors: string[] = []

  for (const provider of PROVIDER_ORDER) {
    const apiKey = await getApiKey(provider.name)
    if (!apiKey) {
      // CONFIG_080: sem credencial — pular silenciosamente
      errors.push(`${provider.name}: sem credencial configurada`)
      continue
    }

    try {
      const raw = await provider.search(params, apiKey)
      void logApiUsage({
        provider: provider.name,
        callType: 'search',
        metadata: { resultCount: raw.length, query: params.query, location: params.location },
      })
      const results = raw.filter((r) => !isHoneypot(r))
      if (results.length > 0) return results
      errors.push(`${provider.name}: retornou 0 resultados válidos (${raw.length - results.length} honeypots filtrados)`)
    } catch (e) {
      errors.push(`${provider.name}: ${(e as Error).message}`)
    }
  }

  // Tier 3: headless fallback (GOOGLE_MAPS only for now)
  if (isHeadlessEnabled()) {
    try {
      const strategy = new GoogleMapsStrategy()
      const results = await strategy.search(params.query, params.location, params.maxResults)
      const filtered = results.filter(r => !isHoneypot(r))
      if (filtered.length > 0) return filtered
      errors.push('google-maps-headless: retornou 0 resultados validos')
    } catch (e) {
      errors.push(`google-maps-headless: ${(e as Error).message}`)
    }
  }

  throw new Error(`Todos os providers falharam: ${errors.join(' | ')}`)
}

export async function searchBusinessesYelp(
  params: BusinessSearchParams,
): Promise<{ results: BusinessResult[]; tier: HeadlessTier }> {
  // Tier 1: API oficial (Yelp Fusion) — preferida sempre que o token existir.
  const apiKey = await getApiKey('yelp-api')
  if (apiKey) {
    const api = await tryYelpApi(params, apiKey)
    if (api.results.length > 0) {
      return { results: api.results, tier: 'OFFICIAL_API' }
    }
  }

  // Tier 3: Headless (gated por feature flag) — usado apenas se API falhar ou
  // token ausente. NAO roda quando o token retorna 0 legitimamente, apenas
  // quando ha falha ou ausencia de credencial.
  if (!isHeadlessEnabled()) {
    return { results: [], tier: apiKey ? 'OFFICIAL_API' : 'HEADLESS' }
  }
  const strategy = new YelpStrategy()
  const results = await strategy.search(params.query, params.location)
  return { results, tier: 'HEADLESS' }
}

// ─── Directory providers (TASK-7 / CL-038) ────────────────────────────────
//
// Hierarquia: nenhum possui API pública oficial -> tier HEADLESS (Apontador,
// GuiaMais) ou INTERMEDIARY via Apify (LinkedIn). Cada função é tolerante a
// falhas e filtra honeypots antes de retornar.

export async function searchBusinessesApontador(
  params: BusinessSearchParams,
): Promise<{ results: BusinessResult[]; tier: HeadlessTier }> {
  if (!isHeadlessEnabled()) return { results: [], tier: 'HEADLESS' }
  const strategy = new ApontadorStrategy()
  const raw = await strategy.search(params.query, params.location, params.maxResults)
  return { results: raw.filter((r) => !isHoneypot(r)), tier: 'HEADLESS' }
}

export async function searchBusinessesGuiaMais(
  params: BusinessSearchParams,
): Promise<{ results: BusinessResult[]; tier: HeadlessTier }> {
  if (!isHeadlessEnabled()) return { results: [], tier: 'HEADLESS' }
  const strategy = new GuiaMaisStrategy()
  const raw = await strategy.search(params.query, params.location, params.maxResults)
  return { results: raw.filter((r) => !isHoneypot(r)), tier: 'HEADLESS' }
}

export async function searchBusinessesLinkedIn(
  params: BusinessSearchParams,
): Promise<{ results: BusinessResult[]; tier: HeadlessTier }> {
  const apiKey = await getApiKey('linkedin-companies')
  if (!apiKey) return { results: [], tier: 'INTERMEDIARY' }
  try {
    const raw = await LinkedInCompaniesProvider.search(params, apiKey)
    return { results: raw.filter((r) => !isHoneypot(r)), tier: 'INTERMEDIARY' }
  } catch {
    return { results: [], tier: 'INTERMEDIARY' }
  }
}

/**
 * Coleta dados sociais via hierarquia de providers (Graph API primario → Apify fallback).
 * Retorna dados do primeiro provider que responder com sucesso.
 * Registra qual camada respondeu no campo `source` de cada resultado.
 */
export async function collectSocial(
  source: 'INSTAGRAM' | 'FACEBOOK',
  params: SocialSearchParams,
  opts: { throwOnExhaustion?: boolean } = {},
): Promise<{ results: SocialProfileData[]; providerUsed: string }> {
  const providers = SOCIAL_PROVIDERS[source] ?? []
  const credKeys = SOCIAL_CRED_MAP[source] ?? []
  const attempts: Array<{ provider: string; error: string }> = []

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i]
    const credKey = credKeys[i] ?? provider.name
    const apiKey = await getApiKey(credKey)

    if (!apiKey) {
      attempts.push({ provider: provider.name, error: 'no-credential' })
      // Structured log (CL-172): provider pulado por falta de credencial
      console.info(
        JSON.stringify({
          event: 'social-provider:skipped',
          source,
          provider: provider.name,
          reason: 'no-credential',
        }),
      )
      continue
    }

    try {
      const results = await provider.collect(params, apiKey)
      void logApiUsage({
        provider: provider.name,
        callType: 'social-collect',
        metadata: { source, resultCount: results.length, attempts: attempts.length },
      })
      return { results, providerUsed: provider.name }
    } catch (e) {
      const msg = (e as Error).message
      attempts.push({ provider: provider.name, error: msg })
      console.warn(
        JSON.stringify({
          event: 'social-provider:failed',
          source,
          provider: provider.name,
          error: msg,
          attemptIndex: i,
        }),
      )
    }
  }

  if (opts.throwOnExhaustion) {
    throw new AllProvidersExhausted(source, attempts)
  }
  return { results: [], providerUsed: 'none' }
}

// ─── Secondary Providers Registry (TASK-11) ────────────────────────────────
//
// Providers de enriquecimento — invocados por workers apos a busca primaria.
// Cada entry declara tier e funcao de consulta. Todos tolerantes a falha
// (retornam null/[] em erro ou sem credencial).

export type SecondaryProviderTier = 'OFFICIAL_API' | 'INTERMEDIARY' | 'HEADLESS'

export interface SecondaryProviderDescriptor {
  name: string
  tier: SecondaryProviderTier
  /** Descricao curta para logs / admin UI */
  description: string
  /** Env var que habilita o provider (se ausente, provider e considerado skipped) */
  requiresEnv?: string[]
}

export const SECONDARY_PROVIDERS: Record<string, SecondaryProviderDescriptor> = {
  'ibge': {
    name: 'ibge',
    tier: 'OFFICIAL_API',
    description: 'IBGE — municipios e regioes (API publica, sem chave)',
  },
  'google-my-business': {
    name: 'google-my-business',
    tier: 'OFFICIAL_API',
    description: 'Google Places Details — horario, fotos, categorias',
    requiresEnv: ['GOOGLE_PLACES_API_KEY'],
  },
  'tripadvisor': {
    name: 'tripadvisor',
    tier: 'OFFICIAL_API',
    description: 'TripAdvisor Content API — rating/reviews para turismo/restaurantes',
    requiresEnv: ['TRIPADVISOR_API_KEY'],
  },
  'reclame-aqui': {
    name: 'reclame-aqui',
    tier: 'HEADLESS',
    description: 'Reclame Aqui — reputacao + reclamacoes (requer Playwright)',
    requiresEnv: ['RECLAME_AQUI_ENABLED'],
  },
  'sintegra': {
    name: 'sintegra',
    tier: 'HEADLESS',
    description: 'Sintegra — validacao IE por UF (requer Playwright + captcha solver)',
    requiresEnv: ['SINTEGRA_ENABLED'],
  },
}

export const secondaryProviders = {
  reclameAqui: queryReclameAqui,
  sintegra: querySintegra,
  tripAdvisor: queryTripAdvisor,
  ibgeMunicipio: fetchIbgeMunicipio,
  gmb: fetchGmb,
} as const

export function isSecondaryProviderEnabled(name: keyof typeof SECONDARY_PROVIDERS): boolean {
  const desc = SECONDARY_PROVIDERS[name]
  if (!desc) return false
  if (!desc.requiresEnv || desc.requiresEnv.length === 0) return true
  return desc.requiresEnv.every((key) => Boolean(process.env[key]))
}

