/**
 * Integration test — notification dispatcher fallback (CL-388).
 * Verifica que in-app é sempre criado, mesmo quando push falha.
 */
import { dispatch } from '@/lib/notifications/dispatcher'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/notifications/channels/web-push-channel', () => ({
  webPushChannel: {
    send: jest.fn(),
  },
}))

const { webPushChannel } = jest.requireMock('@/lib/notifications/channels/web-push-channel')

// UUID real do seed de teste: a coluna user_id e uuid e FK p/ user_profiles
const TEST_USER_ID = '00000000-0000-0000-0000-000000000011'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('notification dispatcher fallback', () => {
  it('writes in-app even when push channel fails (granted scenario)', async () => {
    webPushChannel.send.mockRejectedValueOnce(new Error('410 gone'))

    await dispatch({ event: 'LEAD_HOT', userId: TEST_USER_ID, params: { leadId: 'l1', leadName: 'Test' } })

    const inApp = await prisma.notification.findFirst({ where: { userId: TEST_USER_ID } })
    expect(inApp).toBeDefined()
    expect(inApp?.type).toBe('LEAD_HOT')
  })

  it('writes in-app when push subscription not available (denied scenario)', async () => {
    webPushChannel.send.mockResolvedValueOnce(false)

    await dispatch({ event: 'LEAD_HOT', userId: TEST_USER_ID, params: { leadId: 'l2', leadName: 'Test' } })

    const inApp = await prisma.notification.findFirst({
      where: { userId: TEST_USER_ID },
      orderBy: { createdAt: 'desc' },
    })
    expect(inApp).toBeDefined()
  })

  it('writes in-app when no push configured (default scenario)', async () => {
    webPushChannel.send.mockResolvedValueOnce(false)

    await dispatch({ event: 'LEAD_HOT', userId: TEST_USER_ID, params: { leadId: 'l3', leadName: 'Test' } })

    const count = await prisma.notification.count({ where: { userId: TEST_USER_ID } })
    expect(count).toBeGreaterThan(0)
  })
})
