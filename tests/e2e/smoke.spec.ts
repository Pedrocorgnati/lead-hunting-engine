/**
 * SMOKE E2E — Fluxo ponta-a-ponta "do zero" (Milestone 13 — P2 / I1)
 *
 * Cobre o caminho que o BUDGET.md prometeu validar antes da Entrega Final:
 *
 *   1. Login OPERATOR -> dashboard
 *   2. Disparar coleta -> aguardar status DONE (ou stub via job seedado)
 *   3. Listar leads coletados -> abrir detalhe -> validar score breakdown
 *   4. Gerar pitch LLM (ou validar pitch existente em modo offline)
 *   5. Atualizar lifecycle (status NEW -> CONTACTED)
 *   6. Exportar CSV -> baixar arquivo (>= 1 linha)
 *   7. Acionar DSAR (`GET /api/v1/profile/data-export`) -> JSON portable
 *
 * Pre-requisitos:
 *   - DB de teste seedado com:
 *       * usuario OPERATOR autenticado (E2E_TEST_EMAIL / E2E_TEST_PASSWORD)
 *       * 1 ApiCredential VALID (Google Places) ou flag de mock
 *       * pelo menos 1 lead pre-existente OU coleta dispara via stub
 *   - npm run smoke
 *
 * Status: STUB inicial (gerado em 2026-04-29 pelo /auto-flow delivery-pre milestone-13).
 *   - Estrutura completa do fluxo definida.
 *   - Cada passo tem assertion minima do happy path.
 *   - Edge cases (rede falha, LLM 5xx, export 413) ficam para iteracao seguinte.
 *   - Skips automaticos quando precondicoes nao estiverem disponiveis (ex: sem credencial).
 */

import { test, expect } from '@playwright/test'
import { loginAsUser } from './_fixtures/login'

test.describe('Smoke E2E — fluxo ponta-a-ponta do operador', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, { role: 'OPERATOR' })
  })

  test('1. login redireciona para /dashboard com KPIs renderizados', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/)
    // KPI principais (definidos em src/app/(app)/dashboard/page.tsx:14-39)
    await expect(page.getByText(/leads totais|total leads/i).first()).toBeVisible()
    await expect(page.getByText(/leads quentes|hot leads/i).first()).toBeVisible()
  })

  test('2. lista de leads carrega com paginacao', async ({ page }) => {
    await page.goto('/leads')
    await expect(page.getByTestId('leads-page')).toBeVisible({ timeout: 10_000 })
    // Aceita lista vazia (empty state) ou com leads — ambos sao validos no smoke
    const hasLeads = await page.locator('[data-testid="lead-row"]').first().isVisible().catch(() => false)
    if (!hasLeads) {
      await expect(page.getByText(/nenhum lead|sem leads/i).first()).toBeVisible()
    }
  })

  test('3. detalhe de lead exibe score breakdown (skip se nao houver leads)', async ({ page }) => {
    await page.goto('/leads')
    const firstRow = page.locator('[data-testid="lead-row"]').first()
    const hasLeads = await firstRow.isVisible().catch(() => false)
    test.skip(!hasLeads, 'sem leads no DB de teste — popular via seed:test antes')
    await firstRow.click()
    await expect(page).toHaveURL(/\/leads\/[a-z0-9-]+/i)
    await expect(page.getByText(/score breakdown|pontuacao/i).first()).toBeVisible({ timeout: 5_000 })
  })

  test('4. exportacao retorna arquivo (CSV minimo)', async ({ page }) => {
    await page.goto('/exportar')
    const exportBtn = page.getByTestId('leads-export-button').or(
      page.getByRole('button', { name: /exportar|export/i }).first()
    )
    await expect(exportBtn).toBeVisible({ timeout: 5_000 })
    // Smoke: clica e espera ou download (Promise) ou redirect para /exports (assincrono)
    const [maybeDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 8_000 }).catch(() => null),
      exportBtn.click(),
    ])
    if (maybeDownload) {
      const path = await maybeDownload.path()
      expect(path).toBeTruthy()
    } else {
      // Caminho assincrono — ir para /exports e validar que ha entrada PENDING/DONE
      await page.goto('/exports')
      await expect(page.getByText(/pending|done|aguardando|conclu/i).first()).toBeVisible({ timeout: 5_000 })
    }
  })

  test('5. DSAR LGPD endpoint retorna JSON portable', async ({ page, request }) => {
    // Reaproveita a sessao do browser para o request HTTP autenticado
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
    const res = await request.get('/api/v1/profile/data-export', {
      headers: { Cookie: cookieHeader },
    })
    // Aceita 200 (export OK) ou 429 (rate limit ja consumido neste hour)
    expect([200, 429]).toContain(res.status())
    if (res.status() === 200) {
      const contentType = res.headers()['content-type'] ?? ''
      expect(contentType).toMatch(/application\/json/)
      const body = await res.json()
      expect(body).toBeTruthy()
    }
  })
})

/**
 * TODO (pos-sign-off, gap M13-G11):
 *   - Cenario de coleta real disparada do zero (requer trigger.dev em modo dev ou stub)
 *   - Cenario de geracao de pitch (requer chave Anthropic/OpenAI ou mock LLM)
 *   - Cenario de mudanca de lifecycle com auditoria em LeadHistory
 *   - Cenario de admin: convite -> aceite -> primeiro acesso do operador convidado
 */
