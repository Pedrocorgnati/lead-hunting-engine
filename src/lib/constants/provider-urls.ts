/**
 * URLs base dos providers externos (health-check + coleta).
 *
 * Fonte unica da verdade dos endpoints de API de terceiros, para que rotacao
 * de host/versao aconteca em um unico lugar (antes ficavam hardcoded inline em
 * config.service.ts e nos workers/providers/*). Chaves de API NUNCA vivem aqui:
 * sao injetadas no call-site via query string ou header.
 */
export const PROVIDER_API = {
  /** Google Maps Geocoding — probe de validade da chave. */
  GOOGLE_GEOCODE: 'https://maps.googleapis.com/maps/api/geocode/json',
  /** Outscraper — endpoint de conta para health-check. */
  OUTSCRAPER_ME: 'https://api.outscraper.com/me',
  /** Apify API v2 base — users/me, acts, actor-runs, datasets. */
  APIFY_BASE: 'https://api.apify.com/v2',
  /** OpenAI — listagem de modelos (health-check). */
  OPENAI_MODELS: 'https://api.openai.com/v1/models',
  /** Kimi / Moonshot — listagem de modelos (health-check). */
  KIMI_MODELS: 'https://api.moonshot.ai/v1/models',
  /** Anthropic — listagem de modelos (health-check). */
  ANTHROPIC_MODELS: 'https://api.anthropic.com/v1/models',
  /** HERE Maps — geocoder (health-check). */
  HERE_GEOCODE: 'https://geocode.search.hereapi.com/v1/geocode',
  /** TomTom — search (health-check). */
  TOMTOM_SEARCH: 'https://api.tomtom.com/search/2/search/test.json',
} as const
