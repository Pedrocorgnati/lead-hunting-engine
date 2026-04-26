/**
 * TASK-7 (CL-138) — dispatcher multi-canal.
 * Verifica fan-out para email/push/in-app respeitando NotificationPreference.
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    notificationPreference: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    },
  },
}))

jest.mock('../channels/email-channel', () => ({
  emailChannel: { send: jest.fn() },
  sendEmail: jest.fn(),
}))

jest.mock('../channels/web-push-channel', () => ({
  webPushChannel: { send: jest.fn() },
  sendWebPush: jest.fn(),
}))

import { dispatch } from '../dispatcher'
import { prisma } from '@/lib/prisma'
import { emailChannel } from '../channels/email-channel'
import { webPushChannel } from '../channels/web-push-channel'

const mockPrefFindUnique = (prisma as unknown as {
  notificationPreference: { findUnique: jest.Mock }
}).notificationPreference.findUnique

const mockNotificationCreate = (prisma as unknown as {
  notification: { create: jest.Mock }
}).notification.create

describe('dispatcher multi-canal (TASK-7 / CL-138)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(emailChannel.send as jest.Mock).mockResolvedValue(true)
    ;(webPushChannel.send as jest.Mock).mockResolvedValue(false)
    mockNotificationCreate.mockResolvedValue({ id: 'n1' })
  })

  it('envia email quando user opta (channels inclui email)', async () => {
    mockPrefFindUnique.mockResolvedValue({ channels: ['email', 'in-app'] })
    await dispatch({
      event: 'COLLECTION_BLOCKED' as never,
      userId: 'u1',
      title: 'Coleta bloqueada',
      message: 'Credencial expirada',
    })
    expect(emailChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', title: 'Coleta bloqueada' }),
    )
  })

  it('nao envia email quando canal desabilitado', async () => {
    mockPrefFindUnique.mockResolvedValue({ channels: ['in-app'] })
    await dispatch({
      event: 'COLLECTION_BLOCKED' as never,
      userId: 'u2',
      title: 'Coleta bloqueada',
      message: 'Credencial expirada',
    })
    expect(emailChannel.send).not.toHaveBeenCalled()
  })

  it('nao envia push se web-push-channel retorna false (sem subscription)', async () => {
    mockPrefFindUnique.mockResolvedValue({ channels: ['push', 'email'] })
    ;(webPushChannel.send as jest.Mock).mockResolvedValue(false)
    await dispatch({
      event: 'COLLECTION_BLOCKED' as never,
      userId: 'u3',
      title: 'X',
      message: 'Y',
    })
    // O canal push foi invocado (preferencia permite) mas retornou false;
    // email deve ter recebido a notificacao como backup.
    expect(webPushChannel.send).toHaveBeenCalled()
    expect(emailChannel.send).toHaveBeenCalled()
  })

  it('sempre cria in-app quando externos falham (Zero Silencio)', async () => {
    mockPrefFindUnique.mockResolvedValue({ channels: ['email'] })
    ;(emailChannel.send as jest.Mock).mockResolvedValue(false)
    await dispatch({
      event: 'LEAD_HOT' as never,
      userId: 'u4',
      title: 'Lead quente',
      message: '100',
    })
    expect(mockNotificationCreate).toHaveBeenCalled()
  })

  it('erro em canal externo nao quebra in-app', async () => {
    mockPrefFindUnique.mockResolvedValue({ channels: ['email', 'in-app'] })
    ;(emailChannel.send as jest.Mock).mockRejectedValue(new Error('resend down'))
    await dispatch({
      event: 'COLLECTION_COMPLETED' as never,
      userId: 'u5',
      title: 'X',
      message: 'Y',
    })
    expect(mockNotificationCreate).toHaveBeenCalled()
  })
})
