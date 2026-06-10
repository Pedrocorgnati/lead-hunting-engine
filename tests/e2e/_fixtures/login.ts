import fs from 'node:fs'
import path from 'node:path'
import type { Cookie, Page } from '@playwright/test'

interface LoginOptions {
  email?: string
  password?: string
  role?: 'ADMIN' | 'OPERATOR'
  /** Forca login pelo formulario, ignorando o cache de sessao. */
  fresh?: boolean
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
 * Cache de sessao POR ROLE (cookies) dentro do worker: o primeiro login passa
 * pelo formulario; os seguintes injetam os cookies e pulam o form. Sem isso,
 * cada teste logando do zero estoura o rate-limit do /api/v1/auth/login
 * (beforeEach x N testes em <1min) e os testes finais falham com 429.
 * `fresh: true` ignora o cache (testes que validam o proprio form).
 */
const sessionCache = new Map<string, Cookie[]>()
const AUTH_DIR = path.join(__dirname, '.auth')

function readDiskSession(cacheKey: string): Cookie[] | undefined {
  try {
    const file = path.join(AUTH_DIR, `${cacheKey.replace(/[^a-z0-9]/gi, '_')}.json`)
    const stat = fs.statSync(file)
    // Sessao em disco vale por 30min (access token Supabase dura ~1h)
    if (Date.now() - stat.mtimeMs > 30 * 60 * 1000) return undefined
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Cookie[]
  } catch {
    return undefined
  }
}

function writeDiskSession(cacheKey: string, cookies: Cookie[]): void {
  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true })
    const file = path.join(AUTH_DIR, `${cacheKey.replace(/[^a-z0-9]/gi, '_')}.json`)
    fs.writeFileSync(file, JSON.stringify(cookies))
  } catch {
    // cache best-effort
  }
}

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

  const cacheKey = `${role}:${email}`
  // Sessao anterior (ex.: beforeEach logou OPERATOR e o teste pede ADMIN)
  // precisa ser limpa: /login redireciona usuario logado para /dashboard e o
  // fill do form estoura timeout.
  await page.context().clearCookies()
  // Cache em DISCO alem do in-memory: workers paralelos do Playwright nao
  // compartilham modulo, e N workers relogando estoura o rate-limit por IP
  // do /api/v1/auth/login.
  const cached = options.fresh
    ? undefined
    : sessionCache.get(cacheKey) ?? readDiskSession(cacheKey)
  if (cached) {
    await page.context().addCookies(cached)
    await page.goto('/dashboard')
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 5_000 })
      return
    } catch {
      // Sessao cacheada expirou/invalida — cai para o login real abaixo.
      sessionCache.delete(cacheKey)
      await page.context().clearCookies()
    }
  }

  await page.goto('/login')
  await page.getByLabel(/e-?mail/i).fill(email)
  // getByLabel(/senha/i) casaria tambem o botao 'Mostrar senha' (strict mode)
  await page.getByTestId('form-login-password-input').fill(password)
  await page.getByRole('button', { name: /entrar|sign in|login/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 })

  const cookies = await page.context().cookies()
  sessionCache.set(cacheKey, cookies)
  writeDiskSession(cacheKey, cookies)
}
