import { prisma } from '@/lib/prisma'
import { CryptoUtil } from '@/lib/services/crypto-util'

// Map from provider slug used in workers to CredentialProvider stored in DB
const PROVIDER_SLUG_MAP: Record<string, string> = {
  'google-places': 'GOOGLE_PLACES',
  'outscraper':    'OUTSCRAPER',
  'apify':         'APIFY',
  'here-maps':     'HERE_MAPS',
  'tomtom':        'TOMTOM',
  'openai':        'OPENAI',
  'anthropic':     'ANTHROPIC',
}

/**
 * Fetch and decrypt an API key for the given provider.
 * Returns null without throwing if not found or not active. (CONFIG_080)
 * Never logs the plaintext key (SEC-012).
 */
export async function getApiKey(provider: string): Promise<string | null> {
  const dbProvider = PROVIDER_SLUG_MAP[provider] ?? provider.toUpperCase().replace(/-/g, '_')

  const credential = await prisma.apiCredential.findUnique({
    where: { provider: dbProvider },
    select: { encryptedKey: true, iv: true, isActive: true },
  })

  if (!credential || !credential.isActive) return null

  try {
    // encryptedKey is stored as "ciphertext:authTag" (AES-256-GCM)
    const [ciphertext, authTag] = credential.encryptedKey.split(':')
    if (!ciphertext || !authTag) return null

    return CryptoUtil.decrypt(ciphertext, credential.iv, authTag)
  } catch {
    // Decryption failure — treat as missing credential, never propagate key
    return null
  }
}
