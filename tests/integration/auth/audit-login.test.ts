/**
 * Integration tests — Audit trail de login (CL-041) + lockout unit tests (CL-038).
 *
 * Cobre: TASK-4/ST004.
 *
 * Estrategia:
 *   - computeBackoffMs: testes unitarios puros (sem DB)
 *   - getLockState / recordFailure / recordSuccess: testes de estado in-memory
 *   - LOGIN_FAILED audit: mock Supabase retorna erro, verificar AuditLog entry
 */

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    getAll: jest.fn().mockReturnValue([]),
    set: jest.fn(),
  }),
}))

import { computeBackoffMs, getLockState, recordFailure, recordSuccess } from '@/lib/auth/lockout-policy'
import { POST as loginRoute } from '@/app/api/v1/auth/login/route'
import { createServerClient } from '@supabase/ssr'
import { makeRequest, parseResponseJson } from '../helpers/request.helper'
import { prisma } from '@/lib/prisma'

// ─── computeBackoffMs (unitarios puros) ────────────────────────────────────

describe('computeBackoffMs', () => {
  it('retorna 0 para attemptCount <= 3 (threshold default)', () => {
    expect(computeBackoffMs(1)).toBe(0)
    expect(computeBackoffMs(2)).toBe(0)
    expect(computeBackoffMs(3)).toBe(0)
  })

  it('retorna backoff exponencial apos threshold', () => {
    expect(computeBackoffMs(4)).toBe(2000)
    expect(computeBackoffMs(5)).toBe(4000)
    expect(computeBackoffMs(6)).toBe(8000)
    expect(computeBackoffMs(7)).toBe(16000)
    expect(computeBackoffMs(8)).toBe(32000)
    expect(computeBackoffMs(10)).toBe(128000)
  })

  it('limita em 5 minutos (300_000ms)', () => {
    expect(computeBackoffMs(20)).toBe(300_000)
    expect(computeBackoffMs(50)).toBe(300_000)
  })
})

// ─── lockout state machine ─────────────────────────────────────────────────

describe('lockout state machine', () => {
  const testKey = `lockout:email:test-${Date.now()}@example.com`

  it('estado inicial: sem lockout, 0 tentativas', () => {
    const state = getLockState(testKey)
    expect(state.lockedUntil).toBeNull()
    expect(state.attemptCount).toBe(0)
  })

  it('3 falhas nao ativam lockout (threshold=3)', () => {
    const key = `${testKey}:3fail`
    recordFailure(key)
    recordFailure(key)
    recordFailure(key)
    const state = getLockState(key)
    expect(state.lockedUntil).toBeNull()
    expect(state.attemptCount).toBe(3)
  })

  it('4a falha ativa lockout com delay positivo', () => {
    const key = `${testKey}:4fail`
    recordFailure(key)
    recordFailure(key)
    recordFailure(key)
    recordFailure(key)
    const state = getLockState(key)
    expect(state.lockedUntil).not.toBeNull()
    expect(state.lockedUntil!).toBeGreaterThan(Date.now())
    expect(state.attemptCount).toBe(4)
  })

  it('sucesso reseta o contador', () => {
    const key = `${testKey}:reset`
    recordFailure(key)
    recordFailure(key)
    recordFailure(key)
    recordFailure(key)
    recordSuccess(key)
    const state = getLockState(key)
    expect(state.lockedUntil).toBeNull()
    expect(state.attemptCount).toBe(0)
  })
})

// ─── Audit trail LOGIN_FAILED (integration com DB) ─────────────────────────

describe('LOGIN_FAILED audit trail', () => {
  function mockSupabaseError() {
    const mockClient = {
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: { message: 'Invalid login credentials', status: 401 },
        }),
      },
    }
    ;(createServerClient as jest.Mock).mockReturnValue(mockClient)
  }

  it('registra entrada LOGIN_FAILED no AuditLog com IP e UA', async () => {
    mockSupabaseError()

    const req = makeRequest('POST', '/api/v1/auth/login', {
      body: { email: 'test-audit@example.com', password: 'wrong' },
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'jest-test-agent/1.0',
      },
    })

    await loginRoute(req)

    // Pequena espera para fire-and-forget do AuditService
    await new Promise((r) => setTimeout(r, 100))

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'LOGIN_FAILED' },
      orderBy: { createdAt: 'desc' },
    })

    expect(entry).not.toBeNull()
    expect(entry?.action).toBe('LOGIN_FAILED')
    expect(entry?.ipAddress).toBe('127.0.0.1')
    const meta = entry?.metadata as Record<string, string>
    expect(meta?.userAgent).toBe('jest-test-agent/1.0')
    expect(meta?.emailAttempted).toBe('test-audit@example.com')
  })
})
