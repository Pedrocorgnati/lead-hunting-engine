import { FacebookGraphProvider, analyzeEngagement } from '../facebook-graph'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-18').getTime())
})

afterEach(() => jest.restoreAllMocks())

const searchResponse = {
  data: [{ id: 'page123', name: 'Pizzaria Roma', website: 'https://pizzaria.com' }],
}

const detailResponse = {
  id: 'page123',
  username: 'pizzariaroma',
  fan_count: 8000,
  about: 'A melhor pizza de SP',
  website: 'https://pizzaria.com',
  posts: {
    data: [
      { created_time: '2026-04-10T12:00:00Z', likes: { summary: { total_count: 120 } } },
      { created_time: '2026-03-28T12:00:00Z', likes: { summary: { total_count: 95 } } },
    ],
  },
}

it('returns page handle + engagement from Graph API', async () => {
  mockFetch
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => searchResponse })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => detailResponse })

  const result = await FacebookGraphProvider.collect({ query: 'pizzaria' }, 'fake-token')

  expect(result[0]).toMatchObject({
    handle: 'pizzariaroma',
    followers: 8000,
    source: 'facebook-graph',
  })
  expect(typeof result[0].engagementRate).toBe('number')
})

it('throws FACEBOOK_TOKEN_MISSING when no token', async () => {
  await expect(
    FacebookGraphProvider.collect({ query: 'test' }, '')
  ).rejects.toThrow(/TOKEN_MISSING/)
})

it('throws FACEBOOK_TOKEN_MISSING on 401', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
  await expect(
    FacebookGraphProvider.collect({ query: 'test' }, 'bad-token')
  ).rejects.toThrow(/TOKEN_MISSING/)
})

it('returns empty when pages search returns nothing', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) })
  const result = await FacebookGraphProvider.collect({ query: 'nonexistent' }, 'token')
  expect(result).toHaveLength(0)
})

describe('analyzeEngagement', () => {
  it('flags abandoned when last post > 180 days', () => {
    const out = analyzeEngagement({
      fan_count: 5000,
      posts: [{ created_time: '2025-01-01T00:00:00Z', likes: { summary: { total_count: 3 } } }],
    })
    expect(out.abandonedSignal).toBe(true)
  })

  it('flags abandoned when engagement < 0.1%', () => {
    const out = analyzeEngagement({
      fan_count: 100000,
      posts: [
        { created_time: '2026-04-17T00:00:00Z', likes: { summary: { total_count: 5 } } },
      ],
    })
    expect(out.abandonedSignal).toBe(true)
  })

  it('not abandoned when recent + healthy engagement', () => {
    const out = analyzeEngagement({
      fan_count: 1000,
      posts: [
        { created_time: '2026-04-15T00:00:00Z', likes: { summary: { total_count: 50 } } },
      ],
    })
    expect(out.abandonedSignal).toBe(false)
    expect(out.engagementRate).toBeCloseTo(0.05)
  })
})
