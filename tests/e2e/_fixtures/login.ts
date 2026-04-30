import type { Page } from '@playwright/test'

interface LoginOptions {
  email?: string
  password?: string
  role?: 'ADMIN' | 'OPERATOR'
}

/**
 * Helper de login para suites a11y/e2e. Usa formulario real `/login`.
 *
 * Credenciais via env:
 *   E2E_TEST_EMAIL / E2E_TEST_PASSWORD          — usuario padrao (OPERATOR)
 *   E2E_TEST_ADMIN_EMAIL / E2E_TEST_ADMIN_PASSWORD — admin
 *
 * Quando `role: 'ADMIN'`, usa as credenciais admin.
 *
 * Estrategia: navega para /login, preenche, submete, espera redirect /dashboard.
 */
export async function loginAsUser(page: Page, options: LoginOptions = {}) {
  const role = options.role ?? 'OPERATOR'
  const email =
    options.email ??
    (role === 'ADMIN'
      ? process.env.E2E_TEST_ADMIN_EMAIL
      : process.env.E2E_TEST_EMAIL)
  const password =
    options.password ??
    (role === 'ADMIN'
      ? process.env.E2E_TEST_ADMIN_PASSWORD
      : process.env.E2E_TEST_PASSWORD)

  if (!email || !password) {
    throw new Error(
      `[loginAsUser] credenciais ausentes (role=${role}). Defina E2E_TEST_EMAIL/E2E_TEST_PASSWORD${
        role === 'ADMIN' ? ' e E2E_TEST_ADMIN_EMAIL/E2E_TEST_ADMIN_PASSWORD' : ''
      } no .env.test ou exporte antes do test run.`
    )
  }

  await page.goto('/login')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/senha|password/i).fill(password)
  await page.getByRole('button', { name: /entrar|sign in|login/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 })
}
