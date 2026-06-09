const requireAdminMock = jest.fn()
jest.mock('@/lib/auth', () => {
  class MockAuthError extends Error {
    type: 'UNAUTHORIZED' | 'FORBIDDEN'

    constructor(type: 'UNAUTHORIZED' | 'FORBIDDEN') {
      super(type)
      this.type = type
    }
  }

  return {
    AuthError: MockAuthError,
    requireAdmin: (...args: unknown[]) => requireAdminMock(...(args as never[])),
    handleAuthError: jest.fn(),
  }
})

const getConfigMock = jest.fn()
const setConfigMock = jest.fn()
jest.mock('@/lib/services/system-config', () => ({
  getConfig: (...args: unknown[]) => getConfigMock(...(args as never[])),
  setConfig: (...args: unknown[]) => setConfigMock(...(args as never[])),
}))

const auditLogMock = jest.fn()
jest.mock('@/lib/services/audit-service', () => ({
  AuditService: {
    log: (...args: unknown[]) => auditLogMock(...(args as never[])),
  },
}))

import { NextRequest } from 'next/server'
import { POST as publishBanner } from '../banner/publish/route'
import { DELETE as deleteWindow, GET as getAdminWindow, POST as createWindow } from '../window/route'
import { GET as getPublicWindow } from '../../../health/maintenance-window/route'

const NOW = '2026-05-30T12:00:00.000Z'

function mkReq(path: string, method = 'GET', body?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    method,
    headers: {
      'content-type': 'application/json',
      'user-agent': 'jest',
      'x-forwarded-for': '203.0.113.10',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function activeWindow(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    reason: 'Atualizacao programada',
    message: 'Voltamos as 14h.',
    severity: 'warning',
    startsAt: '2026-05-30T11:00:00.000Z',
    endsAt: '2026-05-30T14:00:00.000Z',
    updatedAt: NOW,
    updatedBy: 'admin-1',
    bannerPublishedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(NOW))
  jest.clearAllMocks()
  requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' })
  getConfigMock.mockResolvedValue({ enabled: false })
  setConfigMock.mockResolvedValue(undefined)
  auditLogMock.mockResolvedValue(undefined)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('maintenance window admin API', () => {
  it('cria janela ativa e registra audit log de ativacao', async () => {
    const res = await createWindow(
      mkReq('/api/v1/admin/maintenance/window', 'POST', {
        reason: 'Atualizacao programada',
        message: 'Voltamos as 14h.',
        severity: 'warning',
        startsAt: '2026-05-30T11:00:00.000Z',
        endsAt: '2026-05-30T14:00:00.000Z',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.data.window).toEqual(expect.objectContaining(activeWindow()))
    expect(setConfigMock).toHaveBeenCalledWith(
      'maintenance.window',
      expect.objectContaining({
        enabled: true,
        reason: 'Atualizacao programada',
        message: 'Voltamos as 14h.',
        severity: 'warning',
      }),
      'admin-1',
    )
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'maintenance.window_activated',
        resource: 'maintenance_window',
        ipAddress: '203.0.113.10',
      }),
    )
  })

  it('consulta e remove a janela sem apagar historico do config', async () => {
    getConfigMock.mockResolvedValueOnce(activeWindow())
    const getRes = await getAdminWindow()
    expect(getRes.status).toBe(200)
    expect((await getRes.json()).data.window.enabled).toBe(true)

    getConfigMock.mockResolvedValueOnce(activeWindow())
    const deleteRes = await deleteWindow(mkReq('/api/v1/admin/maintenance/window', 'DELETE'))
    expect(deleteRes.status).toBe(200)
    expect((await deleteRes.json()).data.window).toBeNull()
    expect(setConfigMock).toHaveBeenCalledWith(
      'maintenance.window',
      expect.objectContaining({ enabled: false, bannerPublishedAt: null }),
      'admin-1',
    )
    expect(auditLogMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'maintenance.window_cancelled' }),
    )
  })

  it('publica banner da janela atual', async () => {
    getConfigMock.mockResolvedValueOnce(activeWindow())

    const res = await publishBanner(
      mkReq('/api/v1/admin/maintenance/banner/publish', 'POST', {
        message: 'Manutencao em andamento.',
        severity: 'critical',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.window).toEqual(
      expect.objectContaining({
        message: 'Manutencao em andamento.',
        severity: 'critical',
        bannerPublishedAt: NOW,
      }),
    )
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maintenance.banner_published' }),
    )
  })
})

describe('GET /api/v1/health/maintenance-window', () => {
  it('expoe janela ativa com motivo, inicio, fim, severidade e mensagem', async () => {
    getConfigMock.mockResolvedValueOnce(activeWindow({ bannerPublishedAt: NOW }))

    const res = await getPublicWindow()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(body.data.active).toBe(true)
    expect(body.data.window).toEqual({
      active: true,
      reason: 'Atualizacao programada',
      message: 'Voltamos as 14h.',
      severity: 'warning',
      startsAt: '2026-05-30T11:00:00.000Z',
      endsAt: '2026-05-30T14:00:00.000Z',
      bannerPublishedAt: NOW,
      updatedAt: NOW,
    })
  })

  it('retorna inactive quando nao existe janela vigente', async () => {
    getConfigMock.mockResolvedValueOnce(activeWindow({ startsAt: '2026-05-31T12:00:00.000Z' }))

    const res = await getPublicWindow()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({ active: false, window: null })
  })
})
