import type { Config } from 'jest'

/**
 * Configuração separada para testes de integração.
 * Executa o stack completo: route → middleware → service → banco real.
 *
 * Pré-requisitos:
 *   1. Banco de teste rodando (PostgreSQL local ou Supabase local: supabase start)
 *   2. DATABASE_URL apontando para banco de TESTE (não produção)
 *   3. Seed executado: bun run seed:test
 *   4. Variáveis de ambiente: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *      SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY (mínimo 32 chars para AES-256-GCM)
 *
 * Execução:
 *   bun run test:integration
 *   npx jest --config jest.integration.config.ts --runInBand
 */
const config: Config = {
  displayName: 'integration',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        diagnostics: false,
      },
    ],
  },
  // Executar sequencialmente — testes de integração compartilham banco
  runInBand: true,
  // Setup de ambiente global
  globalSetup: '<rootDir>/tests/integration/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/integration/globalTeardown.ts',
  // Timeout maior para operações de banco
  testTimeout: 30_000,
  // Variáveis de ambiente para testes
  testEnvironmentOptions: {},
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
}

export default config
