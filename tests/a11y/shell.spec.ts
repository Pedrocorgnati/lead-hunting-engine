/**
 * TASK-MS4-T01 — A11y Shell Suite (axe-core via Playwright)
 *
 * Cobertura WCAG 2.1 AA do shell de navegacao:
 *   - /dashboard (rota principal)
 *   - /leads (lista densa)
 *   - /admin (rotas administrativas)
 *   - drawer mobile aberto
 *   - UserMenu aberto
 *   - /not-found
 *   - error boundary
 *
 * Veredito esperado por cena: 0 violations critical/serious.
 *
 * Requer:
 *   - .env preenchido com SUPABASE_URL/KEY + DATABASE_URL
 *   - usuario seed (E2E_TEST_EMAIL/E2E_TEST_PASSWORD)
 *
 * Helper de auth implementado em tests/e2e/_fixtures/login.ts (ver TASK-MS4-T02).
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginAsUser } from '../e2e/_fixtures/login'

const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function runAxe(page: import('@playwright/test').Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze()
  const blocking = result.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  )
  if (blocking.length > 0) {
    console.error(`[a11y:${label}] ${blocking.length} violations:`)
    for (const v of blocking) {
      console.error(`  - ${v.id} (${v.impact}): ${v.help}`)
      console.error(`    ${v.helpUrl}`)
      for (const node of v.nodes) {
        console.error(`    target: ${node.target.join(' ')}`)
      }
    }
  }
  expect(blocking, `axe ${label} violations critical/serious`).toEqual([])
}

test.describe('A11y — Shell (axe-core WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
  })

  test('Dashboard — sem violations critical/serious', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await runAxe(page, 'dashboard')
  })

  test('Leads — sem violations critical/serious', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    await runAxe(page, 'leads')
  })

  test('Admin — sem violations critical/serious (requer ADMIN)', async ({ page }) => {
    await loginAsUser(page, { role: 'ADMIN' })
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await runAxe(page, 'admin')
  })

  test('Drawer mobile aberto — sem violations critical/serious', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'cobre apenas chromium-mobile project')
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('header-mobile-menu-button').click()
    await expect(page.getByTestId('sidebar-mobile-drawer')).toBeVisible()
    await runAxe(page, 'mobile-drawer-open')
  })

  test('UserMenu aberto — sem violations critical/serious', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('header-user-menu-button').click()
    await expect(page.getByTestId('header-user-menu-profile-item')).toBeVisible()
    await runAxe(page, 'user-menu-open')
  })

  test('404 — sem violations critical/serious', async ({ page }) => {
    await page.goto('/__rota_inexistente_para_a11y__')
    await page.waitForLoadState('networkidle')
    await runAxe(page, 'not-found')
  })
})
