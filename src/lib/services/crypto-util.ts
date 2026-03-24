import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY inválida — deve ter 64 chars hex (32 bytes)')
  }
  return Buffer.from(keyHex, 'hex')
}

export interface EncryptResult {
  encryptedKey: string
  iv: string
  authTag: string
}

export class CryptoUtil {
  static encrypt(plaintext: string): EncryptResult {
    const key = getKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag().toString('hex')

    return {
      encryptedKey: encrypted,
      iv: iv.toString('hex'),
      authTag,
    }
  }

  static decrypt(encryptedKey: string, iv: string, authTag: string): string {
    const key = getKey()
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))
    decipher.setAuthTag(Buffer.from(authTag, 'hex'))

    let decrypted = decipher.update(encryptedKey, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }

  static mask(apiKey: string): string {
    if (apiKey.length <= 8) return '****'
    return `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 4))}${apiKey.slice(-4)}`
  }
}
