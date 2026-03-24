import { getApiKey } from '../utils/get-credential'
import { GooglePlacesProvider } from './google-places'
import { OutscraperProvider } from './outscraper'
import { ApifyProvider } from './apify'
import type { BusinessSearchParams, BusinessResult } from './types'

const PROVIDER_ORDER = [GooglePlacesProvider, OutscraperProvider, ApifyProvider]

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
      const results = raw.filter((r) => !isHoneypot(r))
      if (results.length > 0) return results
      errors.push(`${provider.name}: retornou 0 resultados válidos (${raw.length - results.length} honeypots filtrados)`)
    } catch (e) {
      errors.push(`${provider.name}: ${(e as Error).message}`)
    }
  }

  throw new Error(`Todos os providers falharam: ${errors.join(' | ')}`)
}
