import type { Config } from 'jest'

/**
 * Config dedicado para componentes do shell (TASK-MS4-T02).
 * Roda em jsdom + RTL. Mantemos config separado para nao misturar com
 * a suite herdada (jest.config.ts em node + .test.ts).
 *
 * Uso: `npx jest --config jest.shell.config.ts`
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src/components/shared'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/src/__mocks__/style-mock.ts',
  },
  testMatch: ['**/__tests__/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  setupFilesAfterEnv: ['<rootDir>/src/components/shared/__tests__/setup.ts'],
}

export default config
