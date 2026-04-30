import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config — TASK-MS4-T01 (a11y) + TASK-MS4-T02 (E2E shell).
 *
 * Specs em `tests/a11y/` rodam axe-core sobre o shell autenticado.
 * Specs em `tests/e2e/` rodam fluxos ponta-a-ponta (login, drawer, UserMenu, 404).
 *
 * Para executar localmente:
 *   1. `cp .env.example .env.local` e preencher SUPABASE_*, DATABASE_URL
 *   2. `npm run dev` em outro terminal (ou deixe webServer abaixo subir)
 *   3. `npx playwright test`
 *
 * Para rodar apenas a11y: `npx playwright test tests/a11y`
 * Para rodar apenas e2e:  `npx playwright test tests/e2e`
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        port: 3000,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
