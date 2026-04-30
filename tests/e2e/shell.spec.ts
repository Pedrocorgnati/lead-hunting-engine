/**
 * TASK-MS4-T02 — E2E Shell (Playwright)
 *
 * Cobre os 10 passos canonicos do MILESTONE-4 secao 8 (Smoke E2E):
 *  1. login -> /dashboard com Sidebar + Header
 *  2. colapsar/expandir sidebar (desktop)
 *  3. mobile -> hamburguer abre drawer
 *  4. Escape fecha drawer
 *  5. Tab desde body -> primeiro foco e skip-to-content
 *  6. UserMenu -> Perfil
 *  7. UserMenu -> Sair -> /login
 *  8. /rota-inexistente -> 404
 *  9. Tab no drawer cicla foco (focus trap)
 * 10. Sidebar admin so aparece para ADMIN
 *
 * Pre-requisitos: ver tests/e2e/_fixtures/login.ts
 */
import { test, expect } from '@playwright/test'
import { loginAsUser } from './_fixtures/login'

test.describe('Shell E2E — desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
  })

  test('login redireciona para /dashboard e renderiza shell', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByTestId('sidebar')).toBeVisible()
    await expect(page.getByTestId('header')).toBeVisible()
    await expect(page.getByTestId('main-content')).toBeVisible()
  })

  test('toggle de colapsar sidebar atualiza aria-expanded', async ({ page }) => {
    const toggle = page.getByTestId('sidebar-toggle-button').first()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  test('skip-to-content e o primeiro elemento focavel', async ({ page }) => {
    await page.keyboard.press('Tab')
    const skip = page.getByText(/pular para o conte/i)
    await expect(skip).toBeFocused()
  })

  test('UserMenu -> Perfil navega para /perfil', async ({ page }) => {
    await page.getByTestId('header-user-menu-button').click()
    await page.getByTestId('header-user-menu-profile-item').click()
    await expect(page).toHaveURL(/\/perfil/)
  })

  test('UserMenu -> Sair leva ao /login', async ({ page }) => {
    await page.getByTestId('header-user-menu-button').click()
    await page.getByTestId('header-user-menu-logout-item').click()
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('rota inexistente exibe not-found', async ({ page }) => {
    await page.goto('/__rota_que_nao_existe__')
    await expect(page.getByText(/pagina nao encontrada|not[- ]found/i)).toBeVisible()
  })
})

test.describe('Shell E2E — mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
  })

  test('hamburguer abre drawer', async ({ page }) => {
    await page.getByTestId('header-mobile-menu-button').click()
    const drawer = page.getByTestId('sidebar-mobile-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer).toHaveAttribute('aria-modal', 'true')
  })

  test('Escape fecha drawer', async ({ page }) => {
    await page.getByTestId('header-mobile-menu-button').click()
    await expect(page.getByTestId('sidebar-mobile-drawer')).toBeVisible()
    await page.keyboard.press('Escape')
    // espera transicao
    await page.waitForTimeout(300)
    await expect(page.getByTestId('sidebar-mobile-drawer')).not.toBeVisible()
  })

  test('Tab cicla dentro do drawer (focus trap)', async ({ page }) => {
    await page.getByTestId('header-mobile-menu-button').click()
    const drawer = page.getByTestId('sidebar-mobile-drawer')
    await expect(drawer).toBeVisible()

    // foca primeiro link e ciclar
    const links = drawer.locator('a[href]')
    const first = links.first()
    await first.focus()
    await expect(first).toBeFocused()
    // Shift+Tab no primeiro deve voltar para o ultimo (focus trap)
    await page.keyboard.press('Shift+Tab')
    const last = links.last()
    await expect(last).toBeFocused()
  })
})

test.describe('Shell E2E — admin role', () => {
  test('sidebar mostra secao admin para ADMIN', async ({ page }) => {
    await loginAsUser(page, { role: 'ADMIN' })
    await page.goto('/dashboard')
    await expect(page.getByTestId('sidebar-nav-admin').first()).toBeVisible()
  })

  test('sidebar NAO mostra secao admin para OPERATOR', async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/dashboard')
    await expect(page.getByTestId('sidebar-nav-admin')).toHaveCount(0)
  })
})
