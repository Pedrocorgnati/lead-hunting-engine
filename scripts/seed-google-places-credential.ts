/**
 * scripts/seed-google-places-credential.ts
 *
 * Grava a credencial Google Places no banco (tabela api_credentials), no MESMO
 * formato que a UI Admin -> Credenciais usa (AES-256-GCM, "ciphertext:authTag").
 * Idempotente (upsert por provider). A chave NUNCA aparece em argv nem em log:
 * e lida de process.env.GOOGLE_PLACES_API_KEY (.env) e mascarada na saida.
 *
 * Uso: pnpm tsx scripts/seed-google-places-credential.ts
 * Pre-req: GOOGLE_PLACES_API_KEY e ENCRYPTION_KEY (64 hex) no .env.
 */
import 'dotenv/config'
import { CryptoUtil } from '../src/lib/services/crypto-util'
import { createSeedClient } from '../prisma/seed/client'

const PROVIDER = 'GOOGLE_PLACES'

async function main() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY ausente no .env')

  // 1. Valida a chave no mesmo endpoint que o app usa pra checar credencial.
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=Florianopolis&key=${key}`,
    )
    const data = (await res.json()) as { status?: string; error_message?: string }
    console.log(`[validate] geocoding status: ${data.status} ${data.error_message ?? ''}`.trim())
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn('[validate] AVISO: a chave nao validou OK — verifique billing/APIs habilitadas no Google Cloud.')
    }
  } catch (e) {
    console.warn('[validate] nao foi possivel validar online:', (e as Error).message)
  }

  // 2. Grava criptografado no banco (caminho principal da coleta: getApiKey()).
  const enc = CryptoUtil.encrypt(key)
  const packed = `${enc.encryptedKey}:${enc.authTag}`
  const prisma = createSeedClient()
  try {
    const cred = await prisma.apiCredential.upsert({
      where: { provider: PROVIDER },
      create: { provider: PROVIDER, encryptedKey: packed, iv: enc.iv, isActive: true },
      update: { encryptedKey: packed, iv: enc.iv, isActive: true },
    })
    console.log(`[db] api_credentials upserted: provider=${cred.provider} active=${cred.isActive} key=${CryptoUtil.mask(key)}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('[seed-google-places-credential] erro:', (e as Error).message)
  process.exit(1)
})
