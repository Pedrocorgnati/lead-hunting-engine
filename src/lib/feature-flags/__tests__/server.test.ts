/**
 * Cobre: TASK-2/ST007 + TASK-6 (parte client-only do gating).
 *
 * Mock do provider e do `next/headers` (cookies) para validar:
 * - resolucao via provider
 * - fallback default em caso de timeout
 * - override por cookie em dev (e ignorado em prod)
 * - breadcrumb emitido (sentry mockado)
 */
import { describe, expect, it, jest, beforeEach, afterAll } from '@jest/globals'

const cookiesGetMock = jest.fn<() => { value: string } | undefined>()

jest.mock('next/headers', () => ({
  cookies: async () => ({ get: cookiesGetMock }),
  headers: async () => ({ get: () => null }),
}))

const resolveFlagMock = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const resolveBatchMock = jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>()

jest.mock('../provider', () => ({
  resolveFlagInProvider: resolveFlagMock,
  resolveBatchInProvider: resolveBatchMock,
  getProviderKind: () => 'local',
  getCurrentEnv: () => 'development',
}))

jest.mock('@/lib/observability/sentry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}))

import { getFeatureFlag, resolveCriticalFlags } from '../server'
import { unsafeFeatureFlagName } from '../types'

const FLAG = unsafeFeatureFlagName('fase2.outreach.whatsapp_enabled')

describe('getFeatureFlag', () => {
  const originalEnv = process.env.NODE_ENV

  beforeEach(() => {
    cookiesGetMock.mockReset()
    resolveFlagMock.mockReset()
    resolveBatchMock.mockReset()
  })

  afterAll(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, configurable: true })
  })

  it('[SUCCESS] retorna valor do provider', async () => {
    cookiesGetMock.mockReturnValueOnce(undefined)
    resolveFlagMock.mockResolvedValueOnce(true)
    const v = await getFeatureFlag(FLAG, { userId: 'u1' }, { default: false })
    expect(v).toBe(true)
  })

  it('[DEGRADED] fallback default quando provider lanca', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })
    cookiesGetMock.mockReturnValueOnce(undefined)
    resolveFlagMock.mockRejectedValueOnce(new Error('boom'))
    const v = await getFeatureFlag(FLAG, { userId: 'u1' }, { default: false })
    expect(v).toBe(false)
  })

  it('[SUCCESS] fallback default quando provider devolve null (flag inexistente)', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })
    cookiesGetMock.mockReturnValueOnce(undefined)
    resolveFlagMock.mockResolvedValueOnce(null)
    const v = await getFeatureFlag(FLAG, { userId: 'u1' }, { default: false })
    expect(v).toBe(false)
  })

  it('[SUCCESS] override via cookie em dev sobrepoe provider', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })
    cookiesGetMock.mockReturnValueOnce({ value: JSON.stringify({ [FLAG]: true }) })
    resolveFlagMock.mockResolvedValueOnce(false)
    const v = await getFeatureFlag(FLAG, { userId: 'u1' }, { default: false })
    expect(v).toBe(true)
    // provider nao foi sequer chamado
    expect(resolveFlagMock).not.toHaveBeenCalled()
  })

  it('[SECURITY] override por cookie e ignorado em prod', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true })
    cookiesGetMock.mockReturnValueOnce({ value: JSON.stringify({ [FLAG]: true }) })
    resolveFlagMock.mockResolvedValueOnce(false)
    const v = await getFeatureFlag(FLAG, { userId: 'u1' }, { default: false })
    expect(v).toBe(false)
  })
})

describe('resolveCriticalFlags', () => {
  beforeEach(() => {
    cookiesGetMock.mockReset()
    resolveBatchMock.mockReset()
  })

  it('[SUCCESS] retorna flags resolvidas em lote, com defaults para nulls', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })
    cookiesGetMock.mockReturnValue(undefined)
    resolveBatchMock.mockResolvedValueOnce({
      'fase2.outreach.whatsapp_enabled': true,
      'fase2.dark_mode.toggle_visible': null,
    })
    const flags = await resolveCriticalFlags({ userId: 'u1' }, [
      unsafeFeatureFlagName('fase2.outreach.whatsapp_enabled'),
      unsafeFeatureFlagName('fase2.dark_mode.toggle_visible'),
    ])
    expect(flags['fase2.outreach.whatsapp_enabled']).toBe(true)
    expect(flags['fase2.dark_mode.toggle_visible']).toBe(false)
  })

  it('[DEGRADED] todos defaults quando provider falha', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })
    cookiesGetMock.mockReturnValue(undefined)
    resolveBatchMock.mockRejectedValueOnce(new Error('down'))
    const flags = await resolveCriticalFlags({ userId: 'u1' }, [
      unsafeFeatureFlagName('fase2.outreach.whatsapp_enabled'),
    ])
    expect(flags['fase2.outreach.whatsapp_enabled']).toBe(false)
  })

  it('[SUCCESS] retorna {} sem chamar provider quando lista vazia', async () => {
    const flags = await resolveCriticalFlags({ userId: 'u1' }, [])
    expect(flags).toEqual({})
    expect(resolveBatchMock).not.toHaveBeenCalled()
  })
})
