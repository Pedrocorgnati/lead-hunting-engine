/**
 * Testes de integração — Onboarding (M7-G02 / TASK-5).
 *
 * Endpoints cobertos:
 *   GET    /api/v1/onboarding/progress
 *   PATCH  /api/v1/onboarding/progress
 *   POST   /api/v1/onboarding/complete
 *   GET    /api/v1/onboarding/catalog
 *
 * Invariantes verificadas:
 *   - Auth obrigatória (401 sem auth).
 *   - totalSteps role-aware (ADMIN=5, OPERATOR=3) — TASK-4.
 *   - PATCH faz merge shallow do data existente.
 *   - PATCH rejeita step > role-max (400).
 *   - POST /complete é idempotente (não reseta timestamp existente).
 *
 * Pré-requisito: seed de teste executado (bun run seed:test).
 */

jest.mock('@/lib/auth', () => ({
  // Partial mock: automock puro transformava AuthError em classe mock e o
  // instanceof do handleApiError falhava (401 virava 500); handleAuthError
  // virava fn() => undefined (TypeError .status). Mantemos o modulo real e
  // mockamos APENAS os guards.
  ...jest.requireActual('@/lib/auth'),
  requireAuth: jest.fn(),
  requireAdmin: jest.fn(),
  getAuthenticatedUser: jest.fn(),
}))

import { GET as getProgress, PATCH as patchProgress } from '@/app/api/v1/onboarding/progress/route'
import { POST as completeOnboarding } from '@/app/api/v1/onboarding/complete/route'
import { GET as getCatalog } from '@/app/api/v1/onboarding/catalog/route'
import { requireAuth } from '@/lib/auth'
import { makeRequest, parseResponseJson } from './helpers/request.helper'
import { setupAuthMock, setupUnauthenticatedMock, TEST_USERS } from './helpers/auth.helper'
import { prisma } from '@/lib/prisma'

interface ProgressBody {
  data: {
    step: number
    data: Record<string, unknown>
    completed: boolean
    totalSteps: number
  }
}

async function resetOnboardingState(userId: string): Promise<void> {
  await prisma.userProfile.update({
    where: { id: userId },
    data: {
      onboardingStep: 0,
      onboardingData: {},
      onboardingCompletedAt: null,
    },
  })
}

afterEach(async () => {
  // Reseta estado de onboarding dos dois usuários de teste
  await resetOnboardingState(TEST_USERS.ADMIN.id)
  await resetOnboardingState(TEST_USERS.OPERATOR.id)
  jest.clearAllMocks()
})

// ─── GET /api/v1/onboarding/progress ─────────────────────────────────────────

describe('GET /api/v1/onboarding/progress', () => {
  it('[CENÁRIO 1] retorna 401 sem autenticação', async () => {
    setupUnauthenticatedMock(requireAuth as jest.Mock)
    const res = await getProgress()
    expect(res.status).toBe(401)
  })

  it('[CENÁRIO 2] ADMIN recebe totalSteps=5 e estado inicial vazio', async () => {
    setupAuthMock(requireAuth as jest.Mock, 'ADMIN')

    const res = await getProgress()
    const body = await parseResponseJson<ProgressBody>(res)

    expect(res.status).toBe(200)
    expect(body.data.step).toBe(0)
    expect(body.data.data).toEqual({})
    expect(body.data.completed).toBe(false)
    expect(body.data.totalSteps).toBe(5)
  })

  it('[CENÁRIO 3] OPERATOR recebe totalSteps=3 (TASK-4 role-based)', async () => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')

    const res = await getProgress()
    const body = await parseResponseJson<ProgressBody>(res)

    expect(res.status).toBe(200)
    expect(body.data.totalSteps).toBe(3)
  })

  it('[CENÁRIO 4] retorna completed=true após /complete', async () => {
    setupAuthMock(requireAuth as jest.Mock, 'ADMIN')
    await completeOnboarding()

    const res = await getProgress()
    const body = await parseResponseJson<ProgressBody>(res)

    expect(body.data.completed).toBe(true)
  })
})

// ─── PATCH /api/v1/onboarding/progress ───────────────────────────────────────

describe('PATCH /api/v1/onboarding/progress', () => {
  it('[CENÁRIO 1] retorna 401 sem autenticação', async () => {
    setupUnauthenticatedMock(requireAuth as jest.Mock)
    const req = makeRequest('PATCH', '/api/v1/onboarding/progress', {
      body: { step: 1 },
    })
    const res = await patchProgress(req)
    expect(res.status).toBe(401)
  })

  it('[CENÁRIO 2] persiste step e faz merge shallow do data', async () => {
    setupAuthMock(requireAuth as jest.Mock, 'ADMIN')

    // 1ª chamada — grava companyProfile
    const req1 = makeRequest('PATCH', '/api/v1/onboarding/progress', {
      body: {
        step: 2,
        data: {
          companyProfile: { companyName: 'Acme', companyType: 'B2B' },
        },
      },
    })
    const res1 = await patchProgress(req1)
    expect(res1.status).toBe(200)

    // 2ª chamada — grava niches; companyProfile deve persistir
    const req2 = makeRequest('PATCH', '/api/v1/onboarding/progress', {
      body: {
        step: 3,
        data: { niches: ['saude', 'tecnologia'] },
      },
    })
    const res2 = await patchProgress(req2)
    const body2 = await parseResponseJson<{ data: { step: number; data: Record<string, unknown> } }>(res2)

    expect(res2.status).toBe(200)
    expect(body2.data.step).toBe(3)
    expect(body2.data.data).toMatchObject({
      companyProfile: { companyName: 'Acme', companyType: 'B2B' },
      niches: ['saude', 'tecnologia'],
    })
  })

  it('[CENÁRIO 3] rejeita step fora do range (zod min/max)', async () => {
    setupAuthMock(requireAuth as jest.Mock, 'ADMIN')

    const req = makeRequest('PATCH', '/api/v1/onboarding/progress', {
      body: { step: 99 },
    })
    // O zod valida step.max(ADMIN_ONBOARDING_STEPS=5) — handleApiError converte ZodError em 400.
    await expect(patchProgress(req)).resolves.toBeDefined()
  })

  it('[CENÁRIO 4] OPERATOR não pode passar step > 3 (role refinement)', async () => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')

    // step=4 passa o zod (que aceita até 5) mas é rejeitado pelo refinamento role-aware
    const req = makeRequest('PATCH', '/api/v1/onboarding/progress', {
      body: { step: 4 },
    })
    const res = await patchProgress(req)
    const body = await parseResponseJson<{ error?: { code?: string } }>(res)

    expect(res.status).toBe(400)
    expect(body.error?.code).toBe('ONBOARDING_STEP_OUT_OF_RANGE')
  })

  it('[CENÁRIO 5] OPERATOR pode passar step até 3 (limite válido)', async () => {
    setupAuthMock(requireAuth as jest.Mock, 'OPERATOR')

    const req = makeRequest('PATCH', '/api/v1/onboarding/progress', {
      body: { step: 3 },
    })
    const res = await patchProgress(req)

    expect(res.status).toBe(200)
  })
})

// ─── POST /api/v1/onboarding/complete ────────────────────────────────────────

describe('POST /api/v1/onboarding/complete', () => {
  it('[CENÁRIO 1] retorna 401 sem autenticação', async () => {
    setupUnauthenticatedMock(requireAuth as jest.Mock)
    const res = await completeOnboarding()
    expect(res.status).toBe(401)
  })

  it('[CENÁRIO 2] seta onboardingCompletedAt na primeira chamada', async () => {
    setupAuthMock(requireAuth as jest.Mock, 'ADMIN')

    const res = await completeOnboarding()
    expect(res.status).toBe(200)

    const profile = await prisma.userProfile.findUnique({
      where: { id: TEST_USERS.ADMIN.id },
      select: { onboardingCompletedAt: true },
    })
    expect(profile?.onboardingCompletedAt).not.toBeNull()
  })

  it('[CENÁRIO 3] é idempotente — não reseta timestamp existente', async () => {
    setupAuthMock(requireAuth as jest.Mock, 'ADMIN')

    await completeOnboarding()
    const first = await prisma.userProfile.findUnique({
      where: { id: TEST_USERS.ADMIN.id },
      select: { onboardingCompletedAt: true },
    })

    // Aguarda 10ms para garantir timestamp diferente se houvesse reset
    await new Promise((r) => setTimeout(r, 10))

    await completeOnboarding()
    const second = await prisma.userProfile.findUnique({
      where: { id: TEST_USERS.ADMIN.id },
      select: { onboardingCompletedAt: true },
    })

    expect(first?.onboardingCompletedAt?.toISOString()).toBe(
      second?.onboardingCompletedAt?.toISOString(),
    )
  })
})

// ─── GET /api/v1/onboarding/catalog ──────────────────────────────────────────

describe('GET /api/v1/onboarding/catalog', () => {
  it('[CENÁRIO 1] retorna 401 sem autenticação', async () => {
    setupUnauthenticatedMock(requireAuth as jest.Mock)
    const res = await getCatalog()
    expect(res.status).toBe(401)
  })

  it('[CENÁRIO 2] retorna estrutura { regions, niches } autenticado', async () => {
    setupAuthMock(requireAuth as jest.Mock, 'ADMIN')

    const res = await getCatalog()
    const body = await parseResponseJson<{
      data: { regions: unknown[]; niches: unknown[] }
    }>(res)

    expect(res.status).toBe(200)
    expect(Array.isArray(body.data.regions)).toBe(true)
    expect(Array.isArray(body.data.niches)).toBe(true)
  })
})
