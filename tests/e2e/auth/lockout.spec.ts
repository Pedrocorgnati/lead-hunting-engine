/**
 * E2E — Auth Lockout (backoff exponencial por usuario).
 *
 * Cobre: TASK-4/ST004 (CL-038).
 *
 * Pre-requisitos:
 *   - App rodando em E2E_BASE_URL (default http://localhost:3000)
 *   - Conta de teste com email E2E_LOCKOUT_TEST_EMAIL (nao precisa de senha real)
 *
 * Nota: testa o comportamento de lockout via API direta (nao UI) para controle
 * preciso de timing. O store in-memory e resetado entre instancias do servidor —
 * em CI, cada worker tem seu proprio estado.
 */

import { test, expect, type APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const LOGIN_URL = `${BASE_URL}/api/v1/auth/login`
// Email UNICO por execucao de teste: o lockout e por-email e persiste no
// servidor — email fixo contamina o proximo teste/projeto (401 esperado vira 429).
function uniqueLockoutEmail(): string {
  return (
    process.env.E2E_LOCKOUT_TEST_EMAIL ??
    `lockout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@lead-hunting-engine.test`
  )
}
const WRONG_PASSWORD = 'wrong-password-for-lockout-test'

async function attemptLogin(request: APIRequestContext, email: string, password = WRONG_PASSWORD) {
  return request.post(LOGIN_URL, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  })
}

test.describe('Auth lockout (exponential backoff)', () => {
  test('primeiras 3 tentativas falham com 401, nao 429', async ({ request }) => {
    const email = uniqueLockoutEmail()
    for (let i = 0; i < 3; i++) {
      const res = await attemptLogin(request, email)
      expect(res.status()).toBe(401)
    }
  })

  test('a partir da 4a tentativa recebe 429 com Retry-After crescente', async ({ request }) => {
    const email = uniqueLockoutEmail()
    // Tentativas 1-3: sem lockout
    for (let i = 0; i < 3; i++) {
      await attemptLogin(request, email)
    }

    // Tentativa 4: primeiro lockout
    const res4 = await attemptLogin(request, email)
    expect(res4.status()).toBe(429)
    const retryAfter4 = parseInt(res4.headers()['retry-after'] ?? '0', 10)
    expect(retryAfter4).toBeGreaterThan(0)
    const body4 = await res4.json()
    expect(body4.error?.code).toBe('AUTH_LOCKED_OUT')

    // Aguardar lockout expirar (2s para tentativa 4 com threshold=3)
    await new Promise((r) => setTimeout(r, retryAfter4 * 1000 + 100))

    // Tentativa 5: lockout maior
    const res5 = await attemptLogin(request, email)
    const retryAfter5 = parseInt(res5.headers()['retry-after'] ?? '0', 10)
    expect(retryAfter5).toBeGreaterThan(retryAfter4)
  })

  test('sucesso com senha correta reseta o contador', async ({ request }) => {
    const CORRECT_PASSWORD = process.env.E2E_LOCKOUT_CORRECT_PASSWORD
    if (!CORRECT_PASSWORD) {
      test.skip(true, 'E2E_LOCKOUT_CORRECT_PASSWORD nao configurado')
      return
    }

    const email = process.env.E2E_LOCKOUT_TEST_EMAIL ?? uniqueLockoutEmail()
    // Forcar 3 falhas
    for (let i = 0; i < 3; i++) {
      await attemptLogin(request, email, WRONG_PASSWORD)
    }

    // Login com senha correta deve ter sucesso
    const resOk = await attemptLogin(request, email, CORRECT_PASSWORD)
    expect(resOk.status()).toBe(200)

    // Proxima tentativa errada deve comecar do zero (401, nao 429 imediato)
    const resAfter = await attemptLogin(request, email, WRONG_PASSWORD)
    expect(resAfter.status()).toBe(401)
  })

  test('resposta de lockout nao vaza se conta existe', async ({ request }) => {
    const email = uniqueLockoutEmail()
    for (let i = 0; i < 4; i++) {
      await attemptLogin(request, email)
    }
    const res = await attemptLogin(request, email)
    if (res.status() === 429) {
      const body = await res.json()
      // Mensagem nao deve indicar se o email existe ou nao
      expect(body.error?.message).not.toContain('Usuario')
      expect(body.error?.message).not.toContain('nao encontrado')
      expect(body.error?.message).not.toContain('nao existe')
    }
  })
})
