import { CryptoUtil, type EncryptResult } from '../crypto-util'
import { randomBytes } from 'crypto'

// Valid 32-byte key (64 hex chars)
const TEST_KEY = randomBytes(32).toString('hex')

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY
})

afterAll(() => {
  delete process.env.ENCRYPTION_KEY
})

describe('CryptoUtil', () => {
  describe('encrypt', () => {
    it('should return encryptedKey, iv, and authTag as hex strings', () => {
      const result = CryptoUtil.encrypt('my-secret-api-key')

      expect(result).toHaveProperty('encryptedKey')
      expect(result).toHaveProperty('iv')
      expect(result).toHaveProperty('authTag')
      expect(typeof result.encryptedKey).toBe('string')
      expect(typeof result.iv).toBe('string')
      expect(typeof result.authTag).toBe('string')
    })

    it('should produce different IVs for the same plaintext', () => {
      const r1 = CryptoUtil.encrypt('same-key')
      const r2 = CryptoUtil.encrypt('same-key')

      expect(r1.iv).not.toBe(r2.iv)
    })

    it('should produce a 24-char hex IV (12 bytes)', () => {
      const result = CryptoUtil.encrypt('test')
      expect(result.iv).toHaveLength(24)
    })
  })

  describe('decrypt', () => {
    it('should decrypt back to the original plaintext', () => {
      const plaintext = 'sk-test-1234567890abcdef'
      const encrypted = CryptoUtil.encrypt(plaintext)
      const decrypted = CryptoUtil.decrypt(encrypted.encryptedKey, encrypted.iv, encrypted.authTag)

      expect(decrypted).toBe(plaintext)
    })

    it('should handle empty strings', () => {
      const encrypted = CryptoUtil.encrypt('')
      const decrypted = CryptoUtil.decrypt(encrypted.encryptedKey, encrypted.iv, encrypted.authTag)

      expect(decrypted).toBe('')
    })

    it('should handle unicode characters', () => {
      const plaintext = 'chave-secreta-com-acentuação-é-ü'
      const encrypted = CryptoUtil.encrypt(plaintext)
      const decrypted = CryptoUtil.decrypt(encrypted.encryptedKey, encrypted.iv, encrypted.authTag)

      expect(decrypted).toBe(plaintext)
    })

    it('should throw on tampered ciphertext', () => {
      const encrypted = CryptoUtil.encrypt('sensitive-data')
      const tampered = 'ff' + encrypted.encryptedKey.slice(2)

      expect(() => {
        CryptoUtil.decrypt(tampered, encrypted.iv, encrypted.authTag)
      }).toThrow()
    })

    it('should throw on tampered authTag', () => {
      const encrypted = CryptoUtil.encrypt('sensitive-data')
      const tamperedTag = 'ff' + encrypted.authTag.slice(2)

      expect(() => {
        CryptoUtil.decrypt(encrypted.encryptedKey, encrypted.iv, tamperedTag)
      }).toThrow()
    })
  })

  describe('mask', () => {
    it('should show first 4 and last 4 chars with asterisks in between', () => {
      const result = CryptoUtil.mask('sk-1234567890abcdef')
      expect(result).toBe('sk-1***********cdef')
    })

    it('should return **** for short keys (8 chars or less)', () => {
      expect(CryptoUtil.mask('abcd')).toBe('****')
      expect(CryptoUtil.mask('12345678')).toBe('****')
    })

    it('should handle 9-char keys', () => {
      const result = CryptoUtil.mask('123456789')
      expect(result.startsWith('1234')).toBe(true)
      expect(result.endsWith('6789')).toBe(true)
    })
  })

  describe('key validation', () => {
    it('should throw if ENCRYPTION_KEY is missing', () => {
      const original = process.env.ENCRYPTION_KEY
      delete process.env.ENCRYPTION_KEY

      expect(() => CryptoUtil.encrypt('test')).toThrow('ENCRYPTION_KEY')

      process.env.ENCRYPTION_KEY = original
    })

    it('should throw if ENCRYPTION_KEY has wrong length', () => {
      const original = process.env.ENCRYPTION_KEY
      process.env.ENCRYPTION_KEY = 'tooshort'

      expect(() => CryptoUtil.encrypt('test')).toThrow('ENCRYPTION_KEY')

      process.env.ENCRYPTION_KEY = original
    })
  })
})
