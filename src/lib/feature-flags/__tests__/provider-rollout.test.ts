/**
 * Cobre: TASK-1/TASK-6 — bucket determinista para rollout gradual.
 *
 * Sem dependencias externas — testa apenas o hash determinista
 * exportado por provider.ts via cenarios reproducao.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const findFlagMock = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const getEnvValueMock = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const listAllForResolveMock = jest.fn<(...args: unknown[]) => Promise<unknown[]>>()

jest.mock('../repo', () => ({
  findFlag: findFlagMock,
  getEnvValue: getEnvValueMock,
  listAllForResolve: listAllForResolveMock,
}))

import { resolveFlagInProvider } from '../provider'
import { unsafeFeatureFlagName } from '../types'

const FLAG_NAME = 'fase2.outreach.whatsapp_enabled'
const FLAG = unsafeFeatureFlagName(FLAG_NAME)

beforeEach(() => {
  findFlagMock.mockReset()
  getEnvValueMock.mockReset()
})

describe('resolveFlagInProvider — rollout gradual', () => {
  it('[SUCCESS] retorna defaultValue quando nao ha override por env', async () => {
    findFlagMock.mockResolvedValueOnce({ id: 'flag1', defaultValue: false } as never)
    getEnvValueMock.mockResolvedValueOnce(null)
    const v = await resolveFlagInProvider(FLAG, { userId: 'u1' })
    expect(v).toBe(false)
  })

  it('[SUCCESS] retorna envValue quando definido', async () => {
    findFlagMock.mockResolvedValueOnce({ id: 'flag1', defaultValue: false } as never)
    getEnvValueMock.mockResolvedValueOnce(true as never)
    const v = await resolveFlagInProvider(FLAG, { userId: 'u1' })
    expect(v).toBe(true)
  })

  it('[SUCCESS] rollout 100% sempre retorna target_value', async () => {
    findFlagMock.mockResolvedValueOnce({ id: 'flag1', defaultValue: false } as never)
    getEnvValueMock.mockResolvedValueOnce({
      rollout_pct: 100,
      target_value: true,
      fallback_value: false,
    } as never)
    const v = await resolveFlagInProvider(FLAG, { userId: 'u1' })
    expect(v).toBe(true)
  })

  it('[SUCCESS] rollout 0% sempre retorna fallback_value', async () => {
    findFlagMock.mockResolvedValueOnce({ id: 'flag1', defaultValue: false } as never)
    getEnvValueMock.mockResolvedValueOnce({
      rollout_pct: 0,
      target_value: true,
      fallback_value: false,
    } as never)
    const v = await resolveFlagInProvider(FLAG, { userId: 'u1' })
    expect(v).toBe(false)
  })

  it('[DETERMINISMO] mesmo userId cai sempre no mesmo bucket', async () => {
    findFlagMock.mockResolvedValue({ id: 'flag1', defaultValue: false } as never)
    getEnvValueMock.mockResolvedValue({
      rollout_pct: 50,
      target_value: true,
      fallback_value: false,
    } as never)
    const v1 = await resolveFlagInProvider(FLAG, { userId: 'user-fixo-x' })
    const v2 = await resolveFlagInProvider(FLAG, { userId: 'user-fixo-x' })
    expect(v1).toBe(v2)
  })

  it('[FALLBACK] retorna null quando flag inexistente', async () => {
    findFlagMock.mockResolvedValueOnce(null)
    const v = await resolveFlagInProvider(FLAG, { userId: 'u1' })
    expect(v).toBeNull()
  })
})
