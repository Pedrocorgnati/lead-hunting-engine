jest.mock('../anti-bot', () => ({
  isHeadlessEnabled: jest.fn(() => false),
  humanDelay: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../utils/rate-limiter', () => ({
  RateLimiter: { wait: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('../../utils/retry-backoff', () => ({
  withRetry: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
}))

jest.mock('../../utils/get-credential', () => ({
  getApiKey: jest.fn(),
}))

import { isHeadlessEnabled } from '../anti-bot'
import { getApiKey } from '../../utils/get-credential'
import {
  searchBusinessesApontador,
  searchBusinessesGuiaMais,
  searchBusinessesLinkedIn,
} from '../provider-manager'

const headlessMock = isHeadlessEnabled as jest.Mock
const apiKeyMock = getApiKey as jest.Mock

describe('directory providers dispatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    headlessMock.mockReturnValue(false)
    apiKeyMock.mockResolvedValue(null)
  })

  it('Apontador retorna vazio quando headless desabilitado', async () => {
    const r = await searchBusinessesApontador({ query: 'pizza', location: 'SP' })
    expect(r.results).toEqual([])
    expect(r.tier).toBe('HEADLESS')
  })

  it('GuiaMais retorna vazio quando headless desabilitado', async () => {
    const r = await searchBusinessesGuiaMais({ query: 'pizza', location: 'SP' })
    expect(r.results).toEqual([])
    expect(r.tier).toBe('HEADLESS')
  })

  it('LinkedIn retorna vazio quando sem credencial', async () => {
    apiKeyMock.mockResolvedValueOnce(null)
    const r = await searchBusinessesLinkedIn({ query: 'agencia', location: 'SP' })
    expect(r.results).toEqual([])
    expect(r.tier).toBe('INTERMEDIARY')
  })

  it('LinkedIn tolera erro do provider (nao propaga)', async () => {
    apiKeyMock.mockResolvedValueOnce('fake-token')
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('net down'))
    try {
      const r = await searchBusinessesLinkedIn({ query: 'agencia', location: 'SP' })
      expect(r.results).toEqual([])
      expect(r.tier).toBe('INTERMEDIARY')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
