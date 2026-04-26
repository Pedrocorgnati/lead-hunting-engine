import { InstagramGraphProvider } from '../instagram-graph'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-18').getTime())
})

afterEach(() => jest.restoreAllMocks())

const validPayload = {
  business_discovery: {
    username: 'pizzaria_test',
    followers_count: 5200,
    biography: 'A melhor pizza',
    website: 'https://pizzaria.com.br',
    media_count: 120,
    media: {
      data: [
        { timestamp: '2026-04-10T12:00:00Z' },
        { timestamp: '2026-03-25T12:00:00Z' },
      ],
    },
  },
  id: '123',
}

it('normalizes bio/followers/lastPost from Graph API payload', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => validPayload,
  })

  const result = await InstagramGraphProvider.collect({ query: 'pizzaria', location: 'Sao Paulo' }, 'fake-token')

  expect(result[0]).toMatchObject({
    handle: 'pizzaria_test',
    followers: 5200,
    bio: 'A melhor pizza',
    source: 'instagram-graph',
  })
  expect(result[0].lastPostAt).toBeInstanceOf(Date)
})

it('falls back to error with code INSTAGRAM_TOKEN_MISSING when no token', async () => {
  await expect(
    InstagramGraphProvider.collect({ query: 'pizzaria' }, '')
  ).rejects.toThrow(/TOKEN_MISSING/)
})

it('throws INSTAGRAM_TOKEN_MISSING on 401 response', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })

  await expect(
    InstagramGraphProvider.collect({ query: 'pizzaria' }, 'bad-token')
  ).rejects.toThrow(/TOKEN_MISSING/)
})

it('returns empty array when business_discovery missing', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true, status: 200, json: async () => ({ id: '123' }),
  })

  const result = await InstagramGraphProvider.collect({ query: 'notfound' }, 'token')
  expect(result).toHaveLength(0)
})

it('flags abandoned when last post > 90 days', async () => {
  const oldPost = { ...validPayload }
  oldPost.business_discovery = {
    ...validPayload.business_discovery,
    media: { data: [{ timestamp: '2025-10-01T00:00:00Z' }] },
  }

  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => oldPost })
  const result = await InstagramGraphProvider.collect({ query: 'old' }, 'token')

  expect(result[0].abandonedSignal).toBe(true)
})
