import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/trigger'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // module-16: stub server-only no ambiente jest (vide src/lib/feature-flags)
    '^server-only$': '<rootDir>/src/__tests__/__mocks__/server-only.ts',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  // ST004 — TASK-AUDIT-1: env vars para testes (DATABASE_URL, ENCRYPTION_KEY, etc.)
  setupFiles: ['<rootDir>/src/__tests__/setup-env.ts'],
}

export default config
