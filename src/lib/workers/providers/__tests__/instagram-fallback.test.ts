jest.mock('../../utils/rate-limiter', () => ({
  RateLimiter: { wait: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('../../utils/retry-backoff', () => ({
  withRetry: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
}))

jest.mock('../../utils/get-credential', () => ({
  getApiKey: jest.fn(),
}))

jest.mock('@/lib/observability/api-usage-logger', () => ({
  logApiUsage: jest.fn().mockResolvedValue(undefined),
}))

import { CircuitBreaker } from '../../utils/circuit-breaker'
import { IG_FALLBACK_CB_KEY, InstagramApifyProvider } from '../instagram-apify'
import { InstagramPhantomBusterProvider } from '../instagram-phantombuster'
import { collectSocial, AllProvidersExhausted } from '../provider-manager'
import { getApiKey } from '../../utils/get-credential'

import successFixture from '../../../../__tests__/fixtures/instagram-apify-success.json'
import errorFixture from '../../../../__tests__/fixtures/instagram-apify-error.json'
import pbSuccessFixture from '../../../../__tests__/fixtures/instagram-phantombuster-success.json'

const apiKeyMock = getApiKey as jest.Mock

const originalEnv = { ...process.env }

function setTimers() {
  jest.useFakeTimers({ now: new Date('2026-04-23T12:00:00Z') })
}

function restoreTimers() {
  jest.useRealTimers()
}

function mockFetchSequence(responses: Array<{ status?: number; json?: unknown; ok?: boolean }>) {
  const calls: string[] = []
  const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    calls.push(String(input))
    const r = responses.shift()
    if (!r) throw new Error(`unexpected fetch call #${calls.length}: ${String(input)}`)
    const status = r.status ?? 200
    return {
      ok: r.ok ?? (status >= 200 && status < 300),
      status,
      json: async () => r.json,
    } as unknown as Response
  })
  return { spy, calls }
}

describe('InstagramApifyProvider', () => {
  beforeEach(() => {
    CircuitBreaker.reset()
    setTimers()
  })
  afterEach(() => {
    jest.restoreAllMocks()
    restoreTimers()
  })

  it('mapeia response Apify (fixture) para schema interno', async () => {
    const { spy } = mockFetchSequence([
      { json: successFixture.runStart },
      { json: successFixture.runStatus },
      { json: successFixture.datasetItems },
    ])

    const pending = InstagramApifyProvider.collect(
      { query: 'ig://cliente_teste_ig' },
      'fake-apify-key',
    )
    // Avancar o polling (5s)
    await jest.advanceTimersByTimeAsync(5_000)
    const result = await pending

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      handle: 'cliente_teste_ig',
      followers: 12400,
      bio: expect.stringContaining('Biografia'),
      source: 'instagram-apify',
    })
    expect(result[0].lastPostAt).toBeInstanceOf(Date)
    expect(CircuitBreaker.inspect(IG_FALLBACK_CB_KEY).state).toBe('CLOSED')
    spy.mockRestore()
  })

  it('abre circuit apos 3 falhas e rejeita rapido na 4a', async () => {
    // Simular 3 falhas registradas pelo provider — equivalente a 3 chamadas
    // que lancaram. O provider sempre chama recordFailure no catch.
    CircuitBreaker.recordFailure(IG_FALLBACK_CB_KEY)
    CircuitBreaker.recordFailure(IG_FALLBACK_CB_KEY)
    CircuitBreaker.recordFailure(IG_FALLBACK_CB_KEY)
    expect(CircuitBreaker.inspect(IG_FALLBACK_CB_KEY).state).toBe('OPEN')

    // 4a tentativa falha rapido via breaker aberto — nao chega a fazer fetch
    await expect(
      InstagramApifyProvider.collect({ query: 'ig://x' }, 'key'),
    ).rejects.toThrow(/CIRCUIT_OPEN/)
  })

  it('lanca APIFY_KEY_MISSING sem token', async () => {
    await expect(
      InstagramApifyProvider.collect({ query: 'ig://x' }, ''),
    ).rejects.toThrow(/APIFY_KEY_MISSING/)
  })
})

describe('InstagramPhantomBusterProvider', () => {
  beforeEach(() => {
    CircuitBreaker.reset()
    process.env.PHANTOMBUSTER_IG_AGENT_ID = 'agent-001'
    setTimers()
  })
  afterEach(() => {
    jest.restoreAllMocks()
    process.env = { ...originalEnv }
    restoreTimers()
  })

  it('mapeia response PhantomBuster (fixture) para schema interno', async () => {
    jest.resetModules()
    process.env.PHANTOMBUSTER_IG_AGENT_ID = 'agent-001'
    const { InstagramPhantomBusterProvider: Provider } = await import('../instagram-phantombuster')

    const { spy } = mockFetchSequence([
      { json: pbSuccessFixture.launch },
      { json: pbSuccessFixture.status },
    ])

    const pending = Provider.collect({ query: 'ig://cliente_pb' }, 'pb-key')
    await jest.advanceTimersByTimeAsync(5_000)
    const result = await pending

    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('instagram-phantombuster')
    expect(result[0].followers).toBe(980)
    expect(result[0].handle).toBe('cliente_pb')
    spy.mockRestore()
  })

  it('falha se PHANTOMBUSTER_IG_AGENT_ID ausente', async () => {
    process.env.PHANTOMBUSTER_IG_AGENT_ID = ''
    jest.resetModules()
    const { InstagramPhantomBusterProvider: Provider } = await import('../instagram-phantombuster')
    await expect(Provider.collect({ query: 'ig://x' }, 'key')).rejects.toThrow(
      /PHANTOMBUSTER_IG_AGENT_ID/,
    )
  })

  it('respeita circuit aberto compartilhado com Apify', async () => {
    // forcar 3 falhas no Apify para abrir breaker
    CircuitBreaker.recordFailure(IG_FALLBACK_CB_KEY)
    CircuitBreaker.recordFailure(IG_FALLBACK_CB_KEY)
    CircuitBreaker.recordFailure(IG_FALLBACK_CB_KEY)
    expect(CircuitBreaker.inspect(IG_FALLBACK_CB_KEY).state).toBe('OPEN')

    await expect(
      InstagramPhantomBusterProvider.collect({ query: 'ig://x' }, 'key'),
    ).rejects.toThrow(/CIRCUIT_OPEN/)
  })
})

describe('collectSocial fallback chain', () => {
  beforeEach(() => {
    CircuitBreaker.reset()
    jest.clearAllMocks()
  })

  it('chama Apify quando Graph API falha com token invalido', async () => {
    apiKeyMock.mockImplementation(async (name: string) => {
      if (name === 'instagram-graph') return 'bad-token'
      if (name === 'apify') return 'apify-ok'
      return null
    })

    // 1: Graph falha com 401. 2-4: Apify sucesso (fixture).
    setTimers()
    const { spy } = mockFetchSequence([
      { status: 401, json: { error: { code: 190 } } },
      { json: successFixture.runStart },
      { json: successFixture.runStatus },
      { json: successFixture.datasetItems },
    ])

    const pending = collectSocial('INSTAGRAM', { query: 'ig://x' })
    await jest.advanceTimersByTimeAsync(5_000)
    const { results, providerUsed } = await pending
    expect(providerUsed).toBe('instagram-apify')
    expect(results).toHaveLength(1)
    spy.mockRestore()
    restoreTimers()
  })

  it('lanca AllProvidersExhausted se todos falham e throwOnExhaustion=true', async () => {
    apiKeyMock.mockResolvedValue(null) // nenhuma credencial
    await expect(
      collectSocial('INSTAGRAM', { query: 'ig://x' }, { throwOnExhaustion: true }),
    ).rejects.toBeInstanceOf(AllProvidersExhausted)
  })

  it('retorna results vazio por default (sem throw)', async () => {
    apiKeyMock.mockResolvedValue(null)
    const r = await collectSocial('INSTAGRAM', { query: 'ig://x' })
    expect(r.results).toEqual([])
    expect(r.providerUsed).toBe('none')
  })
})
