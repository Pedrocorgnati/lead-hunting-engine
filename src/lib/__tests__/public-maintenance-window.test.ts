import {
  formatMaintenanceCountdown,
  getMaintenanceWindowSignature,
  isMaintenanceWindowExpired,
  parsePublicMaintenanceWindowResponse,
} from '../public-maintenance-window'

describe('public maintenance window contract', () => {
  it('normaliza severidade desconhecida para info', () => {
    const parsed = parsePublicMaintenanceWindowResponse({
      data: {
        active: true,
        window: {
          active: true,
          reason: 'Janela programada',
          message: 'Estamos em manutencao.',
          severity: 'unexpected',
          startsAt: '2026-05-30T10:00:00.000Z',
          endsAt: '2026-05-30T11:00:00.000Z',
          bannerPublishedAt: null,
          updatedAt: '2026-05-30T09:55:00.000Z',
        },
      },
    })

    expect(parsed.window?.severity).toBe('info')
  })

  it('retorna inactive quando data.active=false', () => {
    expect(
      parsePublicMaintenanceWindowResponse({
        data: { active: false, window: null },
      }),
    ).toEqual({ active: false, window: null })
  })

  it('gera assinatura de dismiss com startsAt e updatedAt', () => {
    const parsed = parsePublicMaintenanceWindowResponse({
      data: {
        active: true,
        window: {
          active: true,
          reason: 'Janela programada',
          message: 'Estamos em manutencao.',
          severity: 'warning',
          startsAt: '2026-05-30T10:00:00.000Z',
          endsAt: null,
          bannerPublishedAt: null,
          updatedAt: '2026-05-30T09:55:00.000Z',
        },
      },
    })

    expect(parsed.window && getMaintenanceWindowSignature(parsed.window)).toBe(
      '2026-05-30T10:00:00.000Z:2026-05-30T09:55:00.000Z',
    )
  })

  it('detecta janela expirada e formata countdown', () => {
    const window = {
      active: true as const,
      reason: 'Janela programada',
      message: 'Estamos em manutencao.',
      severity: 'critical' as const,
      startsAt: '2026-05-30T10:00:00.000Z',
      endsAt: '2026-05-30T11:00:00.000Z',
      bannerPublishedAt: null,
      updatedAt: '2026-05-30T09:55:00.000Z',
    }

    expect(isMaintenanceWindowExpired(window, new Date('2026-05-30T11:00:00.000Z').getTime())).toBe(
      true,
    )
    expect(
      formatMaintenanceCountdown(
        window.endsAt,
        new Date('2026-05-30T10:59:30.000Z').getTime(),
      ),
    ).toBe('30s restantes')
  })
})
